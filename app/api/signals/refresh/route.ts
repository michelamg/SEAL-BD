import { gatherSignals } from '@/lib/sources'
import { recordAudit } from '@/lib/audit-log'
import { requireUser } from '@/lib/api/auth'
import { rateLimit } from '@/lib/api/rate-limit'
import { parseJson } from '@/lib/api/validate'
import { Errors } from '@/lib/api/responses'
import { captureError } from '@/lib/logger'
import { z } from 'zod'

export const maxDuration = 60

const Schema = z.object({ companyId: z.string().min(1) })

// POST /api/signals/refresh  { companyId }
// Runs every enabled source connector for the company, corroborates across them,
// and persists any new signals into lead_signals (de-duped). Does not re-score —
// the caller can follow with /api/audit.
export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const rl = rateLimit(`signals:${user.id}`, { limit: 20, windowMs: 60_000 })
    if (!rl.ok) return Errors.rateLimited(rl.retryAfterSec)

    const parsed = await parseJson(request, Schema)
    if ('error' in parsed) return parsed.error
    const { companyId } = parsed.data

  const { data: company, error: cErr } = await supabase
    .from('companies')
    .select('id, name, website')
    .eq('id', companyId)
    .single()
  if (cErr || !company) return Response.json({ error: 'Company not found' }, { status: 404 })

  const gathered = await gatherSignals({ name: company.name, website: company.website })

  // De-dupe against what's already stored (same source + type + observed date).
  const { data: existing } = await supabase
    .from('lead_signals')
    .select('signal_type, source, observed_at')
    .eq('company_id', companyId)
  const seen = new Set((existing ?? []).map((r: Record<string, unknown>) => `${r.source}|${r.signal_type}|${r.observed_at ?? ''}`))

  const fresh = gathered.filter((s) => !seen.has(`${s.source}|${s.type}|${s.observed_at ?? ''}`))

  if (fresh.length > 0) {
    await supabase.from('lead_signals').insert(
      fresh.map((s) => ({
        company_id: companyId,
        signal_type: s.type,
        summary: s.summary,
        source: s.source,
        source_url: s.source_url,
        observed_at: s.observed_at,
        confidence: s.confidence,
        corroboration_count: s.corroboration_count ?? 1,
      })),
    )
    await supabase.from('company_events').insert({
      company_id: companyId,
      event_type: 'signal_added',
      description: `${fresh.length} new signal${fresh.length > 1 ? 's' : ''} from ${[...new Set(fresh.map((s) => s.source))].join(', ')}`,
      actor_email: user.email,
    })
    await recordAudit(supabase, {
      actor_id: user.id,
      actor_email: user.email,
      action: 'signal_refresh',
      entity_type: 'company',
      entity_id: companyId,
      metadata: { added: fresh.length },
    })
  }

    return Response.json({ added: fresh.length, total: gathered.length, signals: gathered })
  } catch (err) {
    captureError(err, { route: 'signals/refresh' })
    return Errors.internal()
  }
}
