import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

// Privileged service-role client. It BYPASSES Row-Level Security, so it is
// server-only — never import this into a client component. Two guards:
//   • throws if somehow evaluated in a browser context (defense in depth), and
//   • throws if the service-role key is absent, instead of silently degrading to
//     the anon key (which under RLS fails in confusing ways).
// The key is read from SUPABASE_SERVICE_ROLE_KEY (not NEXT_PUBLIC_*), so Next
// never inlines it into the client bundle.
export function getSupabaseServer(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('getSupabaseServer() must never run in the browser — it bypasses RLS.')
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('getSupabaseServer requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  }
  return createSupabaseClient(url, serviceKey, { auth: { persistSession: false } })
}
