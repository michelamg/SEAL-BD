import { buildSalesforceCsv, type ExportCompany, type ExportContact } from '@/lib/salesforce-export'
import { recordAudit } from '@/lib/audit-log'
import { requireUser } from '@/lib/api/auth'
import { rateLimit } from '@/lib/api/rate-limit'
import { Errors } from '@/lib/api/responses'
import { captureError } from '@/lib/logger'

// GET /api/export/salesforce?stage=active
// Streams a Salesforce-import CSV of companies at the given stage(s). No direct
// write to Salesforce — C&W's team loads this file (D7). Authenticated only.
export async function GET(request: Request) {
  try {
    const auth = await requireUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const rl = rateLimit(`export:${user.id}`, { limit: 10, windowMs: 60_000 })
    if (!rl.ok) return Errors.rateLimited(rl.retryAfterSec)

  const url = new URL(request.url)
  const stageParam = url.searchParams.get('stage') ?? 'active'
  const stages = stageParam.split(',').map((s) => s.trim()).filter(Boolean)

  // Validate against the company_stage enum so a bad query value is a clean 400,
  // not a Postgres enum error surfaced as a 500.
  const VALID_STAGES = new Set(['prospect', 'qualifying', 'active', 'nurturing', 'won', 'lost', 'disqualified'])
  const invalidStages = stages.filter((s) => !VALID_STAGES.has(s))
  if (stages.length === 0 || invalidStages.length > 0) {
    return Errors.badRequest(`Invalid stage(s): ${invalidStages.join(', ') || '(none provided)'}`)
  }

  const { data, error } = await supabase
    .from('companies')
    .select('*, contacts(first_name, last_name, title, email, phone, is_c_suite)')
    .in('stage', stages)
    .order('current_score', { ascending: false, nullsFirst: false })

  if (error) return Errors.internal()

  const companies: ExportCompany[] = ((data as Record<string, unknown>[]) ?? []).map((c) => ({
    name: c.name as string,
    website: c.website as string | null,
    industry: c.industry as string | null,
    vertical: c.vertical as string | null,
    employee_count: c.employee_count as number | null,
    size: c.size as string | null,
    city: c.city as string | null,
    state: c.state as string | null,
    location: c.location as string | null,
    stage: c.stage as string | null,
    priority: c.priority as string | null,
    trigger_signal: c.trigger_signal as string | null,
    estimated_sf: c.estimated_sf as number | null,
    current_score: c.current_score as number | null,
    owner: c.owner as string | null,
    notes: c.notes as string | null,
    primaryContact: pickPrimaryContact(c.contacts as ExportContact[] | undefined),
  }))

  const { csv, rowCount } = buildSalesforceCsv(companies)

  await recordAudit(supabase, {
    actor_id: user.id,
    actor_email: user.email,
    action: 'export',
    entity_type: 'salesforce_csv',
    metadata: { stages, rowCount },
  })

  // Slugify the (user-controlled) stage segment so it can't inject characters
  // into the Content-Disposition header.
  const stageSlug = stages.join('-').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'export'
  const filename = `salesforce-export-${stageSlug}-${new Date().toISOString().slice(0, 10)}.csv`
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
  } catch (err) {
    captureError(err, { route: 'export/salesforce' })
    return Errors.internal()
  }
}

// Prefer a C-suite contact with an email; fall back to any emailed contact, then
// the first contact on file.
function pickPrimaryContact(contacts: ExportContact[] | undefined): ExportContact | null {
  if (!contacts || contacts.length === 0) return null
  return (
    contacts.find((c) => (c as { is_c_suite?: boolean }).is_c_suite && c.email) ??
    contacts.find((c) => c.email) ??
    contacts[0]
  )
}
