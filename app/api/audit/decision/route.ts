import { recordAudit } from '@/lib/audit-log'
import { requireUser } from '@/lib/api/auth'
import { rateLimit } from '@/lib/api/rate-limit'
import { parseJson } from '@/lib/api/validate'
import { Errors, jsonError } from '@/lib/api/responses'
import { captureError } from '@/lib/logger'
import { z } from 'zod'

type Decision = 'approved' | 'deferred' | 'disqualified'

const Schema = z.object({
  companyId: z.string().min(1),
  auditId: z.string().optional(),
  decision: z.enum(['approved', 'deferred', 'disqualified']),
  reason: z.string().optional(),
})

// Disqualify and defer are *states*, never deletions (D8). Each maps to a CRM
// stage; the company row and its full history are always retained.
const STAGE_FOR: Record<Decision, string> = {
  approved: 'active',
  deferred: 'nurturing',
  disqualified: 'disqualified',
}

// POST /api/audit/decision  { companyId, auditId?, decision, reason }
// Records a triage decision against the latest (or specified) audit, advances the
// company stage, and writes a timeline + audit-log entry. Nothing is deleted.
export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const rl = rateLimit(`decision:${user.id}`, { limit: 20, windowMs: 60_000 })
    if (!rl.ok) return Errors.rateLimited(rl.retryAfterSec)

    const parsed = await parseJson(request, Schema)
    if ('error' in parsed) return parsed.error
    const { companyId, decision, reason } = parsed.data

  if (decision === 'disqualified' && !reason?.trim()) {
    // Force a structured reason on disqualify so the database learns from it.
    return jsonError('A reason is required to disqualify a lead', 400)
  }

  // Resolve which audit to stamp: the one passed, else the company's latest.
  let auditId = parsed.data.auditId
  if (!auditId) {
    const { data: latest } = await supabase
      .from('lead_audits')
      .select('id')
      .eq('company_id', companyId)
      .order('scored_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    auditId = latest?.id
  }

  if (auditId) {
    // Constrain the audit to its company so a caller can't stamp company A's
    // decision onto company B's audit by mixing IDs.
    const { data: updated, error: updErr } = await supabase
      .from('lead_audits')
      .update({
        decision,
        decision_reason: reason ?? null,
        decided_by: user.email,
        decided_at: new Date().toISOString(),
      })
      .eq('id', auditId)
      .eq('company_id', companyId)
      .select('id')
    if (updErr) return Errors.internal()
    if (!updated || updated.length === 0) {
      return jsonError('Audit does not belong to this company', 409)
    }
  }

  // Stage advance + timeline are denormalized follow-ups to the stamped decision
  // above. Check their errors (don't swallow), but keep 200 — the audit stamp is
  // the record of truth and a 500 here would prompt a retry that double-logs the
  // event. Surface a warning instead.
  const { error: stageErr } = await supabase
    .from('companies')
    .update({ stage: STAGE_FOR[decision] })
    .eq('id', companyId)

  const { error: evErr } = await supabase.from('company_events').insert({
    company_id: companyId,
    event_type: 'status_change',
    description: `Triaged: ${decision}${reason ? ` — ${reason}` : ''}`,
    actor_email: user.email,
    metadata: { decision, auditId: auditId ?? null },
  })
  if (stageErr) captureError(stageErr, { route: 'decision', stage: 'company-stage' })
  if (evErr) captureError(evErr, { route: 'decision', stage: 'event-insert' })

  await recordAudit(supabase, {
    actor_id: user.id,
    actor_email: user.email,
    action: 'decision',
    entity_type: 'company',
    entity_id: companyId,
    metadata: { decision, auditId: auditId ?? null },
  })

    return Response.json({
      ok: true,
      decision,
      auditId: auditId ?? null,
      ...(stageErr || evErr ? { warning: 'Decision recorded; stage/timeline update partially failed.' } : {}),
    })
  } catch (err) {
    captureError(err, { route: 'decision' })
    return Errors.internal()
  }
}
