import type { LeadSource, RawSignal, SourceCompany } from './types'
import { secEdgarSource } from './sec-edgar'
import { exploriumSource } from './explorium'
import { usaSpendingSource } from './usaspending'
import { newsSource } from './news'
import { permitsSource } from './permits'

export type { LeadSource, RawSignal, SourceCompany } from './types'

// The source registry. Add a connector here and the whole pipeline picks it up
// (D10 pluggable architecture). `gatherSignals` only runs the ones with
// `enabled: true`. The free layer (SEC EDGAR + USASpending, always on; News when
// SERP_API_KEY is set) covers most of a paid aggregator's event value at ~$0;
// Explorium stays flagged off until it's keyed + validated. Future adds: USPTO,
// county permits, ATS/hiring feeds.
export const SOURCES: LeadSource[] = [
  secEdgarSource,
  usaSpendingSource,
  newsSource,
  permitsSource,
  exploriumSource,
]

const DAY_MS = 86_400_000

function withinWindow(a: string | null | undefined, b: string | null | undefined, days: number): boolean {
  if (!a && !b) return true // both undated — same "current state" bucket
  if (!a || !b) return false // can't corroborate timing if only one is dated
  const ta = new Date(a).getTime()
  const tb = new Date(b).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false
  return Math.abs(ta - tb) <= days * DAY_MS
}

// Multi-source corroboration (D10): a signal confirmed by N independent sources,
// for the same type within a time window, gets corroboration_count = N. Pure and
// unit-testable.
export function corroborate(signals: RawSignal[], windowDays = 60): RawSignal[] {
  return signals.map((s) => {
    const sources = new Set<string>()
    for (const o of signals) {
      if (o.type === s.type && withinWindow(s.observed_at, o.observed_at, windowDays)) {
        sources.add(o.source)
      }
    }
    return { ...s, corroboration_count: Math.max(s.corroboration_count ?? 1, sources.size) }
  })
}

// Run every enabled source for a company, then corroborate across them. A source
// that throws is dropped (allSettled), never failing the gather.
export async function gatherSignals(company: SourceCompany): Promise<RawSignal[]> {
  const results = await Promise.allSettled(SOURCES.filter((s) => s.enabled).map((s) => s.fetchSignals(company)))
  const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  return corroborate(all)
}
