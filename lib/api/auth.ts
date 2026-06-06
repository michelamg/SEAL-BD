import type { User, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { Errors } from './responses'

export type AuthResult = { user: User; supabase: SupabaseClient } | { error: Response }

// Single authorization choke point for route handlers. Returns the authenticated
// user + a request-scoped (RLS-enforcing) client, or a 401 Response to return.
//
//   const auth = await requireUser()
//   if ('error' in auth) return auth.error
//   const { user, supabase } = auth
export async function requireUser(): Promise<AuthResult> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { error: Errors.unauthenticated() }
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
