# RLS verification test plan

A manual test plan to run **once live Supabase keys land** and the schema +
`rls.sql` are applied. It proves the authorization model in `supabase/rls.sql`
behaves as designed. Run it against a dev/staging project with synthetic data — never
against real prospect PII.

## Setup

Create three accounts via Supabase Auth (each fires the `handle_new_user` trigger,
creating an unapproved `profiles` row):

| Account     | Setup                                                              |
| ----------- | ----------------------------------------------------------------- |
| `admin@…`   | `UPDATE profiles SET role='admin', approved=TRUE WHERE email='admin@…';`  |
| `broker@…`  | `UPDATE profiles SET approved=TRUE WHERE email='broker@…';` (role stays `broker`) |
| `pending@…` | leave as-is (unapproved)                                          |

Seed at least two companies and a couple of `lead_signals` / `company_events` rows
(e.g. via the admin account or the service role). You can drive each check from the
Supabase SQL editor using `SET request.jwt.claims` to impersonate a user, or from the
app signed in as each account. Note the company IDs and a `lead_audits` ID.

---

## Test 1 — Shared-team read (D2)

**As `broker@…`:** `SELECT * FROM companies;`

- ✅ Expect: all companies returned, including ones owned by other brokers. `owner`
  is an attribute, not a wall.
- ❌ Fail: only owned rows, or zero rows.

Repeat for `contacts`, `listings`, `lead_audits`, `lead_signals`, `company_events`.

## Test 2 — Broker cannot escalate role/approved (privilege escalation)

**As `broker@…`:**

```sql
UPDATE profiles SET role = 'admin'   WHERE id = auth.uid();   -- expect 0 rows / blocked
UPDATE profiles SET approved = FALSE WHERE id = auth.uid();   -- expect 0 rows / blocked
UPDATE profiles SET full_name = 'New Name' WHERE id = auth.uid(); -- expect SUCCESS
```

- ✅ Expect: `role` and `approved` updates affect **0 rows** (blocked by the
  `WITH CHECK` that pins them to current values); the `full_name` self-update succeeds.
- ❌ Fail: the broker's `role` becomes `admin` or `approved` flips.

Also confirm a broker cannot escalate *another* user:
`UPDATE profiles SET role='admin' WHERE email='pending@…';` → 0 rows.

## Test 3 — Append-only: `lead_signals` and `company_events` reject UPDATE

**As `broker@…` (or `admin@…`):**

```sql
UPDATE lead_signals  SET summary = 'tampered' WHERE id = '<signal_id>'; -- expect blocked / 0 rows
UPDATE company_events SET description = 'tampered' WHERE id = '<event_id>'; -- expect blocked / 0 rows
INSERT INTO lead_signals (...) VALUES (...);  -- expect SUCCESS
```

- ✅ Expect: UPDATE is rejected (no UPDATE policy exists → append-only); INSERT and
  SELECT succeed.
- ❌ Fail: any UPDATE mutates a row.

**Bonus — `lead_audits` column lock:**

```sql
UPDATE lead_audits SET score = 100      WHERE id = '<audit_id>'; -- expect blocked (REVOKE UPDATE on score)
UPDATE lead_audits SET narrative = 'x'  WHERE id = '<audit_id>'; -- expect blocked
UPDATE lead_audits SET decision = 'approved', decision_reason = 'good fit',
       decided_by = 'broker@…', decided_at = now() WHERE id = '<audit_id>'; -- expect SUCCESS
```

- ✅ Expect: score/narrative/factors/snapshot updates blocked; only the four decision
  columns are updatable.

## Test 4 — Unapproved users see nothing (approved-member gating)

**As `pending@…`:**

```sql
SELECT * FROM companies;     -- expect 0 rows
SELECT * FROM lead_audits;   -- expect 0 rows
INSERT INTO companies (name) VALUES ('Sneaky Co'); -- expect blocked (is_member() = false)
SELECT * FROM profiles WHERE id = auth.uid();      -- expect their OWN row only
```

- ✅ Expect: zero business rows, inserts blocked; they can still see their own
  `profiles` row (so the app can resolve identity) but not the roster.
- ❌ Fail: any company/audit data is visible or writable.

## Test 5 — Admin-only delete (D8)

**As `broker@…`:** `DELETE FROM companies WHERE id = '<id>';`

- ✅ Expect: blocked / 0 rows (DELETE requires `is_admin()`).

**As `admin@…`:** `DELETE FROM companies WHERE id = '<id>';`

- ✅ Expect: success.
- ⚠️ Note: in normal product use leads are never deleted (disqualify/defer are
  *states*); this only verifies the policy boundary.

## Test 6 — `audit_log` visibility

```sql
-- as broker@…
INSERT INTO audit_log (action) VALUES ('test');  -- expect SUCCESS (members may append)
SELECT * FROM audit_log;                          -- expect 0 rows (admin-only read)
-- as admin@…
SELECT * FROM audit_log;                          -- expect rows visible
UPDATE audit_log SET action = 'x' WHERE id = '<id>'; -- expect blocked (immutable)
```

---

## Pass criteria

All six tests behave exactly as the ✅ expectations describe. Any ❌ result is a
release blocker — do not point production traffic at the project until it is resolved.
Record the run (date, project ref, tester, outcomes) in the engagement log.
