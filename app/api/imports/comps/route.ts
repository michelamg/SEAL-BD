import { getSupabaseServer } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { parseCompsCSV } from '@/lib/csv-parser'

export async function POST(request: Request) {
  // Bulk import bypasses RLS via the service role, so authorize in-route first —
  // the proxy gate is not a substitute for route-level authorization.
  const { data: userData } = await (await createClient()).auth.getUser()
  if (!userData.user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

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
}
