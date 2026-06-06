import { getSupabaseServer } from '@/lib/supabase/admin'
import { parseCompsCSV } from '@/lib/csv-parser'
import { requireUser } from '@/lib/api/auth'
import { rateLimit } from '@/lib/api/rate-limit'
import { Errors } from '@/lib/api/responses'
import { captureError } from '@/lib/logger'

export async function POST(request: Request) {
  // Bulk import bypasses RLS via the service role, so authorize in-route first —
  // the proxy gate is not a substitute for route-level authorization.
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user } = auth

  const rl = rateLimit(`import-comps:${user.id}`, { limit: 10, windowMs: 60_000 })
  if (!rl.ok) return Errors.rateLimited(rl.retryAfterSec)

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return Response.json({ error: 'No file' }, { status: 400 })

    if (file.size > 10 * 1024 * 1024) {
      return Response.json({ error: 'File too large (max 10MB)' }, { status: 413 })
    }

    const db = getSupabaseServer()

    let comps: ReturnType<typeof parseCompsCSV> = []
    try {
      const text = await file.text()
      comps = parseCompsCSV(text)
    } catch (err) {
      console.error(err)
      return Response.json({ error: 'Request failed' }, { status: 400 })
    }

    if (comps.length > 0) {
      await db.from('lease_comps').insert(comps)
    }

    return Response.json({ count: comps.length })
  } catch (err) {
    captureError(err, { route: 'imports/comps' })
    return Errors.internal()
  }
}
