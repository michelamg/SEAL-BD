import type { LeadSource, RawSignal, SourceCompany } from './types'
import { secEdgarSource } from './sec-edgar'

export type { LeadSource, RawSignal, SourceCompany } from './types'

// The source registry. Add a connector here and the whole pipeline picks it up
// (D10 pluggable architecture). Phase 2 adds USPTO, county permits, FDA/DoD
// awards, hiring/ATS, dedicated news. SerpAPI/Apollo/ZoomInfo already feed the
// finder and can be adapted into LeadSources later.
export const SOURCES: LeadSource[] = [secEdgarSource]

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
