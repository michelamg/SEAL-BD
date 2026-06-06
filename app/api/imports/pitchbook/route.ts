import { getSupabaseServer } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { parsePitchbookCSV } from '@/lib/csv-parser'

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

  let companies: ReturnType<typeof parsePitchbookCSV> = []
  try {
    const text = await file.text()
    companies = parsePitchbookCSV(text)
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Request failed' }, { status: 400 })
  }

  // Create report record
  const { data: report } = await db.from('pitchbook_reports').insert({
    filename: file.name,
    record_count: companies.length,
  }).select().single()

  if (!report) return Response.json({ error: 'Failed to create report' }, { status: 500 })

  // Insert companies
  if (companies.length > 0) {
    await db.from('pitchbook_companies').insert(
      companies.map((c) => ({ ...c, report_id: report.id }))
    )
  }

  await db.from('pitchbook_reports').update({ processed: true }).eq('id', report.id)

  return Response.json({ reportId: report.id, count: companies.length })
}
