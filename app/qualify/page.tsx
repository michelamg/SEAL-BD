'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Scorecard, type ContactRow, type Decision } from '@/components/qualify/scorecard'
import type { Scorecard as ScorecardData, SignalInput, ScoreBand } from '@/lib/scoring'
import { Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface QueueCompany {
  id: string
  name: string
  vertical?: string | null
  location?: string | null
  stage?: string | null
  current_score?: number | null
}

const BAND_DOT: Record<ScoreBand, string> = {
  hot: 'bg-emerald-500',
  warm: 'bg-amber-500',
  cool: 'bg-sky-500',
  cold: 'bg-gray-300',
}

function bandFor(score: number | null | undefined): ScoreBand {
  if (score == null) return 'cold'
  if (score >= 70) return 'hot'
  if (score >= 50) return 'warm'
  if (score >= 30) return 'cool'
  return 'cold'
}

// Rebuild a Scorecard shape from a persisted lead_audits row (no re-scoring).
function scorecardFromAudit(a: Record<string, unknown>): ScorecardData {
  return {
    score: (a.score as number) ?? 0,
    band: ((a.score_band as ScoreBand) ?? 'cold'),
    factors: (a.factors as ScorecardData['factors']) ?? [],
    corroboratedSignals: (a.corroboration as number) ?? 0,
    lease: {
      read: (a.lease_timing as string) ?? '',
      confidence: (a.lease_confidence as ScorecardData['lease']['confidence']) ?? 'unverified',
      monthsToExpiry: null,
    },
    recommendedAction: (a.recommended_action as string) ?? '',
  }
}

export default function QualifyPage() {
  const [queue, setQueue] = useState<QueueCompany[]>([])
  const [loadingQueue, setLoadingQueue] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<QueueCompany | null>(null)

  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [signals, setSignals] = useState<SignalInput[]>([])
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null)
  const [narrative, setNarrative] = useState<string | null>(null)
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchQueue = useCallback(async () => {
    setLoadingQueue(true)
    const { data } = await supabase
      .from('companies')
      .select('id, name, vertical, location, stage, current_score')
      .in('stage', ['prospect', 'qualifying'])
      .order('current_score', { ascending: false, nullsFirst: false })
      .order('name', { ascending: true })
    setQueue((data as QueueCompany[]) ?? [])
    setLoadingQueue(false)
  }, [])

  useEffect(() => {
    // Fetch the queue on mount. (Matches the codebase-wide load-on-mount pattern;
    // the strict set-state-in-effect rule flags it but the behavior is intended.)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchQueue()
  }, [fetchQueue])

  const loadSignals = useCallback(async (companyId: string): Promise<SignalInput[]> => {
    const { data } = await supabase
      .from('lead_signals')
      .select('signal_type, observed_at, confidence, corroboration_count, source, source_url, summary')
      .eq('company_id', companyId)
    return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
      type: r.signal_type as SignalInput['type'],
      observed_at: (r.observed_at as string | null) ?? null,
      confidence: (r.confidence as SignalInput['confidence']) ?? 'unverified',
      corroboration_count: (r.corroboration_count as number) ?? 1,
      source: (r.source as string) ?? undefined,
      source_url: (r.source_url as string) ?? undefined,
      summary: (r.summary as string) ?? undefined,
    }))
  }, [])

  const selectCompany = useCallback(
    async (c: QueueCompany) => {
      setSelected(c)
      setScorecard(null)
      setNarrative(null)
      setError(null)
      setLoadingAudit(true)
      try {
        const [{ data: contactRows }, { data: auditRow }, sig] = await Promise.all([
          supabase.from('contacts').select('id, first_name, last_name, title, email, phone, is_c_suite').eq('company_id', c.id),
          supabase.from('lead_audits').select('*').eq('company_id', c.id).order('scored_at', { ascending: false }).limit(1).maybeSingle(),
          loadSignals(c.id),
        ])
        setContacts((contactRows as ContactRow[]) ?? [])
        setSignals(sig)
        if (auditRow) {
          setScorecard(scorecardFromAudit(auditRow as Record<string, unknown>))
          setNarrative((auditRow as Record<string, unknown>).narrative as string)
        }
      } finally {
        setLoadingAudit(false)
      }
    },
    [loadSignals],
  )

  const runAudit = useCallback(async () => {
    if (!selected) return
    setLoadingAudit(true)
    setError(null)
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Audit failed')
      setScorecard(data.scorecard)
      setNarrative(data.narrative)
      setSignals(data.signals ?? [])
      fetchQueue()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoadingAudit(false)
    }
  }, [selected, fetchQueue])

  const decide = useCallback(
    async (decision: Decision, reason?: string) => {
      if (!selected) return
      setDeciding(true)
      setError(null)
      try {
        const res = await fetch('/api/audit/decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId: selected.id, decision, reason }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Decision failed')
        // Triaged companies leave the prospect/qualifying queue.
        setQueue((q) => q.filter((c) => c.id !== selected.id))
        setSelected(null)
        setScorecard(null)
      } catch (e) {
        setError(String(e))
      } finally {
        setDeciding(false)
      }
    },
    [selected],
  )

  const filtered = queue.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex h-full">
      {/* Queue */}
      <aside className="w-80 shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-bold">Qualify Queue</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{queue.length} awaiting triage</p>
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingQueue ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12 px-4">
              Queue is clear. New prospects appear here after sourcing.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => selectCompany(c)}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
                      selected?.id === c.id ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{c.name}</span>
                      {c.current_score != null && (
                        <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground shrink-0">
                          <span className={`w-2 h-2 rounded-full ${BAND_DOT[bandFor(c.current_score)]}`} />
                          {c.current_score}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {[c.vertical, c.location].filter(Boolean).join(' · ') || 'Unclassified'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Dossier */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">Select a prospect to review its audit.</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto p-6">
            {error && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {error}
              </div>
            )}
            <Scorecard
              company={selected}
              scorecard={scorecard}
              narrative={narrative}
              signals={signals}
              contacts={contacts}
              loading={loadingAudit}
              deciding={deciding}
              onRunAudit={runAudit}
              onDecision={decide}
            />
          </div>
        )}
      </div>
    </div>
  )
}
