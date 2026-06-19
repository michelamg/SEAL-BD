import type { SignalType } from '@/lib/scoring'
import { inferSignalType } from '@/lib/signals'
import { fetchJsonSafe } from '@/lib/http'
import type { LeadSource, RawSignal, SourceCompany } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Explorium (Vibe Prospecting) source connector — Phase 2.
//
// Feature-flagged OFF by default: it never spends a credit until EXPLORIUM_ENABLED
// is 'true' AND an API key is set. This lets the connector ship now (typed,
// tested mapping, registered in the pipeline) without touching C&W's billing
// until they validate the data quality and agree to the subscription.
//
// It maps Explorium business *events* (fetch-businesses-events) into the same
// RawSignal shape every other source produces, so it corroborates (D10) with SEC
// EDGAR et al. and feeds the deterministic scorecard with freshness decay (D9).
//
// NOTE: confirm the exact endpoint + request/response field names against
// Explorium's API docs (or the @vibeprospecting/vpai SDK) before enabling.
// ─────────────────────────────────────────────────────────────────────────────

const EXPLORIUM_API_BASE = process.env.EXPLORIUM_API_BASE || 'https://api.explorium.ai'
const EXPLORIUM_API_KEY = process.env.EXPLORIUM_API_KEY
const EXPLORIUM_ENABLED = process.env.EXPLORIUM_ENABLED === 'true' && !!EXPLORIUM_API_KEY

// Shape of one Explorium business event (per fetch-businesses-events).
export interface ExploriumEvent {
  event_type?: string
  event_time?: string // ISO date the event occurred
  title?: string
  summary?: string
  url?: string
}

// Map Explorium's event categories to our signal taxonomy; fall back to text
// inference for anything unrecognized.
const EVENT_TYPE_MAP: [RegExp, SignalType][] = [
  [/fund|round|series|ipo|invest|capital.?raise/i, 'funding'],
  [/exec|leadership|c[-_ ]?level|ceo|cfo|cto|appoint|new.?hire.?exec/i, 'leadership'],
  [/office|location|expansion|relocat|new.?site|headquarter|hq/i, 'expansion'],
  [/hir|headcount|\bjob|workforce|growth/i, 'hiring'],
  [/contract|award|\bgov|federal|defense/i, 'gov_contract'],
  [/filing|\bsec\b|8-?k|10-?k|s-1/i, 'filing'],
]

export function classifyExploriumEvent(eventType?: string, summary?: string): SignalType {
  const hay = `${eventType ?? ''} ${summary ?? ''}`
  for (const [re, type] of EVENT_TYPE_MAP) {
    if (re.test(hay)) return type
  }
  return inferSignalType(summary)
}

// Pure: Explorium events → normalized RawSignals. Explorium is a verified data
// provider, so confidence defaults to 'verified' (it reaches the hot queue and
// can be narrated by the audit LLM).
export function mapExploriumEvents(events: ExploriumEvent[]): RawSignal[] {
  return events.map((e) => ({
    type: classifyExploriumEvent(e.event_type, e.summary ?? e.title),
    summary: e.summary ?? e.title ?? e.event_type ?? 'Explorium event',
    observed_at: e.event_time ?? null,
    source: 'Explorium',
    source_url: e.url,
    confidence: 'verified',
  }))
}

export const exploriumSource: LeadSource = {
  name: 'Explorium',
  enabled: EXPLORIUM_ENABLED,
  async fetchSignals(company: SourceCompany): Promise<RawSignal[]> {
    if (!EXPLORIUM_ENABLED) return [] // flagged off → zero credits, zero network
    const json = await fetchJsonSafe<{ events?: ExploriumEvent[] }>(
      `${EXPLORIUM_API_BASE}/v1/businesses/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${EXPLORIUM_API_KEY}` },
        body: JSON.stringify({ company: company.name, website: company.website ?? undefined }),
      },
      { events: [] },
    )
    return mapExploriumEvents(json.events ?? [])
  },
}
