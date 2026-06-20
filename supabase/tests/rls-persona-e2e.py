#!/usr/bin/env python3
"""End-to-end RLS verification across all user personas (D1/D2 security model).

Creates a throwaway user for each persona, signs in to get a user-scoped JWT, and
asserts the access matrix against the LIVE REST API — proving Row-Level Security
actually enforces the contract, not just that policies exist.

Personas / expected access to business tables (companies used as representative —
every business table shares the same is_member()/is_admin() policy functions):

    persona              SELECT   INSERT   DELETE
    anon (no auth)       0 rows   blocked  blocked
    authed UNAPPROVED    0 rows   blocked  blocked   <- signup != data access
    authed broker        pipeline allowed  blocked   <- DELETE is admin-only
    authed admin         pipeline allowed  allowed

Note on DELETE: PostgREST returns 204 for an RLS-blocked DELETE (the policy filters
the row out, so 0 rows match = "success, deleted nothing"). Status code alone can't
distinguish blocked from deleted, so this test verifies by ROW SURVIVAL via the
service role, not by status code.

Usage (point at a DEV/staging project if you can — it creates+deletes real auth
users and rows; it self-cleans in a finally block, but still mutates the target DB):

    export SUPABASE_URL=https://<ref>.supabase.co
    export ANON_KEY=<anon key>
    export SR_KEY=<service role key>
    python3 supabase/tests/rls-persona-e2e.py

Exit code 0 = all checks passed, 1 = a check failed.
"""
import json, urllib.request, urllib.error, os, sys, time

BASE = os.environ["SUPABASE_URL"].rstrip("/")
ANON = os.environ["ANON_KEY"]
SR   = os.environ["SR_KEY"]
UA   = "Mozilla/5.0"
TAG  = "zzz-e2e-rls-test"  # marker so cleanup can find test rows


def call(method, url, key, bearer=None, body=None, prefer=None):
    headers = {"apikey": key, "Authorization": f"Bearer {bearer or key}",
               "Content-Type": "application/json", "User-Agent": UA}
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        r = urllib.request.urlopen(req, timeout=30)
        txt = r.read().decode()
        return r.status, (json.loads(txt) if txt.strip() else None)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            parsed = json.loads(txt)
        except Exception:
            parsed = txt[:200]
        return e.code, parsed


def signin(email, pw):
    st, b = call("POST", f"{BASE}/auth/v1/token?grant_type=password", ANON, body={"email": email, "password": pw})
    return b.get("access_token") if isinstance(b, dict) else None


created_user_ids, seeded_company_ids = [], []


def cleanup():
    for uid in created_user_ids:
        call("DELETE", f"{BASE}/auth/v1/admin/users/{uid}", SR)
    call("DELETE", f"{BASE}/rest/v1/companies?name=like.{TAG}*", SR)


def main():
    # seed a company members should be able to see (service role bypasses RLS)
    st, b = call("POST", f"{BASE}/rest/v1/companies", SR, body={"name": f"{TAG}-seed"}, prefer="return=representation")
    assert st == 201, f"seed company failed: {st} {b}"
    seeded_company_ids.append(b[0]["id"])

    # create 3 persona users; the on_auth_user_created trigger makes a
    # profiles row (role='broker', approved=false) for each
    personas = {}
    for role in ("unapproved", "broker", "admin"):
        email, pw = f"{TAG}-{role}@example.com", "Test-Passw0rd-123!"
        st, b = call("POST", f"{BASE}/auth/v1/admin/users", SR, body={"email": email, "password": pw, "email_confirm": True})
        assert st in (200, 201), f"create {role} failed: {st} {b}"
        created_user_ids.append(b["id"])
        personas[role] = {"email": email, "pw": pw, "id": b["id"]}

    # approve broker + admin; promote admin
    call("PATCH", f"{BASE}/rest/v1/profiles?id=eq.{personas['broker']['id']}", SR, body={"approved": True})
    call("PATCH", f"{BASE}/rest/v1/profiles?id=eq.{personas['admin']['id']}", SR, body={"approved": True, "role": "admin"})
    time.sleep(1)

    for role in personas:
        personas[role]["jwt"] = signin(personas[role]["email"], personas[role]["pw"])
        assert personas[role]["jwt"], f"signin {role} failed"

    def probe(label, key, jwt):
        st_s, b_s = call("GET", f"{BASE}/rest/v1/companies?select=id&limit=50", key, bearer=jwt)
        n = len(b_s) if isinstance(b_s, list) else f"err:{st_s}"
        st_i, _ = call("POST", f"{BASE}/rest/v1/companies", key, bearer=jwt, body={"name": f"{TAG}-by-{label}"})
        # DELETE verified by row survival, not status code (see module docstring)
        _, sb = call("POST", f"{BASE}/rest/v1/companies", SR, body={"name": f"{TAG}-del-{label}"}, prefer="return=representation")
        rid = sb[0]["id"]; seeded_company_ids.append(rid)
        call("DELETE", f"{BASE}/rest/v1/companies?id=eq.{rid}", key, bearer=jwt, prefer="return=minimal")
        _, chk_b = call("GET", f"{BASE}/rest/v1/companies?id=eq.{rid}&select=id", SR)
        survived = isinstance(chk_b, list) and len(chk_b) == 1
        return n, st_i, ("kept" if survived else "DELETED")

    rows = {
        "anon":       ("anon (anon key, no auth)",) + probe("anon", ANON, ANON),
        "unapproved": ("authed UNAPPROVED",) + probe("unapproved", ANON, personas["unapproved"]["jwt"]),
        "broker":     ("authed APPROVED broker",) + probe("broker", ANON, personas["broker"]["jwt"]),
        "admin":      ("authed ADMIN",) + probe("admin", ANON, personas["admin"]["jwt"]),
    }

    print("\n=== RLS ACCESS MATRIX (companies) ===")
    print(f"{'persona':28} {'SELECT rows':>12} {'INSERT':>8} {'DELETE result':>14}")
    for r in rows.values():
        print(f"{r[0]:28} {str(r[1]):>12} {str(r[2]):>8} {str(r[3]):>14}")

    anon, unapp, brok, adm = rows["anon"], rows["unapproved"], rows["broker"], rows["admin"]
    ok = True
    def chk(cond, msg):
        nonlocal ok
        print(("  PASS " if cond else "  FAIL ") + msg); ok = ok and cond

    print("\n=== ASSERTIONS ===")
    chk(anon[1] == 0, "anon sees 0 companies (no anon SELECT policy)")
    chk(anon[2] in (401, 403), f"anon INSERT blocked (got {anon[2]})")
    chk(anon[3] == "kept", "anon DELETE blocked")
    chk(unapp[1] == 0, "UNAPPROVED authed user sees 0 — signup != data access (D2)")
    chk(unapp[2] in (401, 403), f"UNAPPROVED INSERT blocked (got {unapp[2]})")
    chk(unapp[3] == "kept", "UNAPPROVED DELETE blocked")
    chk(brok[1] >= 1, "APPROVED broker sees the shared pipeline (is_member)")
    chk(brok[2] == 201, f"APPROVED broker can INSERT (got {brok[2]})")
    chk(brok[3] == "kept", "broker DELETE blocked — admin-only")
    chk(adm[1] >= 1, "ADMIN sees the pipeline")
    chk(adm[3] == "DELETED", "ADMIN can DELETE")
    print("\nRESULT:", "ALL PERSONA RLS CHECKS PASSED" if ok else "SOME CHECKS FAILED")
    return ok


if __name__ == "__main__":
    try:
        passed = main()
    finally:
        cleanup()
        print("(cleanup done — test users + test companies removed)")
    sys.exit(0 if passed else 1)
