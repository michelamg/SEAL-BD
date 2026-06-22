import type { User, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { Errors } from './responses'

export type AuthResult = { user: User; supabase: SupabaseClient } | { error: Response }

// Single authorization choke point for route handlers. Returns the authenticated,
// approved user + a request-scoped (RLS-enforcing) client, or an error Response.
//
//   const auth = await requireUser()
//   if ('error' in auth) return auth.error
//   const { user, supabase } = auth
//
// Approval gate (D2): an authenticated but UNAPPROVED account (e.g. self-registered,
// pending admin approval) must not read/write data or reach paid external APIs. RLS
// enforces this for user-scoped DB access, but service-role routes (imports) and
// external-API routes (leads/enrich/ideas/…) bypass RLS — so the gate lives here, at
// the one choke point every route already calls. `profiles.approved` defaults false;
// an admin flips it (see supabase/RUNBOOK.md).
export async function requireUser(): Promise<AuthResult> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { error: Errors.unauthenticated() }
  const { data: profile } = await supabase.from('profiles').select('approved').eq('id', data.user.id).maybeSingle()
  if (!profile?.approved) return { error: Errors.forbidden() }
  return { user: data.user, supabase }
}

// Require the caller to be an admin (profiles.role = 'admin' AND approved).
export async function requireAdmin(): Promise<AuthResult> {
  const auth = await requireUser()
  if ('error' in auth) return auth
  const { data } = await auth.supabase.from('profiles').select('role, approved').eq('id', auth.user.id).maybeSingle()
  if (!data || data.role !== 'admin' || !data.approved) return { error: Errors.forbidden() }
  return auth
}
