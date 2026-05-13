import { getSupabaseServer } from '@/lib/supabase'
import { parsePitchbookCSV } from '@/lib/csv-parser'

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file') as File
  if (!file) return Response.json({ error: 'No file' }, { status: 400 })

  const text = await file.text()
  const db = getSupabaseServer()

  let companies: ReturnType<typeof parsePitchbookCSV> = []
  try {
    companies = parsePitchbookCSV(text)
  } catch (e) {
    return Response.json({ error: `Parse error: ${e}` }, { status: 400 })
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
