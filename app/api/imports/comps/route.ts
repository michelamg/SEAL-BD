import { getSupabaseServer } from '@/lib/supabase'
import { parseCompsCSV } from '@/lib/csv-parser'

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file') as File
  if (!file) return Response.json({ error: 'No file' }, { status: 400 })

  const text = await file.text()
  const db = getSupabaseServer()

  let comps: ReturnType<typeof parseCompsCSV> = []
  try {
    comps = parseCompsCSV(text)
  } catch (e) {
    return Response.json({ error: `Parse error: ${e}` }, { status: 400 })
  }

  if (comps.length > 0) {
    await db.from('lease_comps').insert(comps)
  }

  return Response.json({ count: comps.length })
}
