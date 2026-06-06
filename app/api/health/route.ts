import { createClient } from '@/lib/supabase/server'

// Liveness + readiness probe (unauthenticated — see PUBLIC_PREFIXES in the proxy).
// Returns 200 for liveness; `checks.db` reports DB reachability for readiness.
// Intentionally exposes no internal detail.
export const dynamic = 'force-dynamic'

export async function GET() {
  let db: 'ok' | 'unavailable' = 'unavailable'
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('profiles').select('id', { head: true, count: 'exact' })
    db = error ? 'unavailable' : 'ok'
  } catch {
    db = 'unavailable'
  }
  return Response.json({ status: 'ok', checks: { db } })
}
