import { createClient } from '@/lib/supabase/server'
import { recordAudit } from '@/lib/audit-log'

type Decision = 'approved' | 'deferred' | 'disqualified'

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
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { companyId?: string; auditId?: string; decision?: Decision; reason?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { companyId, decision, reason } = body
  if (!companyId || !decision) {
    return Response.json({ error: 'companyId and decision are required' }, { status: 400 })
  }
  if (!(decision in STAGE_FOR)) {
    return Response.json({ error: `Invalid decision "${decision}"` }, { status: 400 })
  }
  if (decision === 'disqualified' && !reason?.trim()) {
    // Force a structured reason on disqualify so the database learns from it.
    return Response.json({ error: 'A reason is required to disqualify a lead' }, { status: 400 })
  }

  // Resolve which audit to stamp: the one passed, else the company's latest.
  let auditId = body.auditId
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
    if (updErr) return Response.json({ error: updErr.message }, { status: 500 })
    if (!updated || updated.length === 0) {
      return Response.json({ error: 'Audit does not belong to this company' }, { status: 409 })
    }
  }

  await supabase.from('companies').update({ stage: STAGE_FOR[decision] }).eq('id', companyId)

  await supabase.from('company_events').insert({
    company_id: companyId,
    event_type: 'status_change',
    description: `Triaged: ${decision}${reason ? ` — ${reason}` : ''}`,
    actor_email: user.email,
    metadata: { decision, auditId: auditId ?? null },
  })

  await recordAudit(supabase, {
    actor_id: user.id,
    actor_email: user.email,
    action: 'decision',
    entity_type: 'company',
    entity_id: companyId,
    metadata: { decision, auditId: auditId ?? null },
  })

  return Response.json({ ok: true, decision, auditId: auditId ?? null })
}
