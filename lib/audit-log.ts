import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuditLogEntry {
  actor_id?: string | null
  actor_email?: string | null
  action: string // 'login' | 'audit' | 'decision' | 'export' | 'data_change' | ...
  entity_type?: string | null
  entity_id?: string | null
  metadata?: Record<string, unknown>
}

// Append an immutable access/audit-log row. Logging must never break the request
// it is recording, so failures are swallowed (and surfaced to the server console
// only). The audit_log table is INSERT-only under RLS and admin-readable.
export async function recordAudit(db: SupabaseClient, entry: AuditLogEntry): Promise<void> {
  try {
    const { error } = await db.from('audit_log').insert(entry)
    if (error) console.error('[audit-log] insert failed:', error.message)
  } catch (e) {
    console.error('[audit-log] insert threw:', e)
  }
}
