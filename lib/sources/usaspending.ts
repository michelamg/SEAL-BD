import type { LeadSource, RawSignal, SourceCompany } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// USASpending.gov source connector — federal contract awards.
//
// Free, no API key, authoritative (the official U.S. government spending API).
// Surfaces gov_contract signals — high value for C&W's Defense vertical. Always
// enabled because it costs nothing; guarded by a timeout and never throws.
// ─────────────────────────────────────────────────────────────────────────────

const API = 'https://api.usaspending.gov/api/v2/search/spending_by_award/'
// Definitive contracts + IDVs (exclude grants/loans — not relevant to CRE intent).
const CONTRACT_TYPE_CODES = ['A', 'B', 'C', 'D']

export interface UsaSpendingAward {
  'Recipient Name'?: string
  'Award Amount'?: number
  'Start Date'?: string
  'Award Type'?: string
  Description?: string
  generated_internal_id?: string
}

// Pure: federal awards → normalized RawSignals (verified — it's the official source).
export function mapUsaSpendingAwards(awards: UsaSpendingAward[]): RawSignal[] {
  return awards.map((a) => {
    const amount = a['Award Amount']
    const desc = a['Description']
    const summary =
      `Federal contract award` +
      (amount ? ` ($${Number(amount).toLocaleString()})` : '') +
      (desc ? `: ${desc}` : '')
    return {
      type: 'gov_contract' as const,
      summary: summary.slice(0, 300),
      observed_at: a['Start Date'] ?? null,
      source: 'USASpending.gov',
      source_url: a.generated_internal_id
        ? `https://www.usaspending.gov/award/${a.generated_internal_id}`
        : 'https://www.usaspending.gov',
      confidence: 'verified' as const,
    }
  })
}

export const usaSpendingSource: LeadSource = {
  name: 'USASpending.gov',
  enabled: true, // free + authoritative
  async fetchSignals(company: SourceCompany): Promise<RawSignal[]> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters: {
            recipient_search_text: [company.name],
            award_type_codes: CONTRACT_TYPE_CODES,
          },
          fields: ['Recipient Name', 'Award Amount', 'Start Date', 'Award Type', 'Description'],
          limit: 5,
          sort: 'Start Date',
          order: 'desc',
        }),
        signal: controller.signal,
      })
      if (!res.ok) return []
      const json = (await res.json()) as { results?: UsaSpendingAward[] }
      // Recipient search is fuzzy; keep only awards whose recipient actually
      // contains the company name (case-insensitive) to avoid false positives.
      const needle = company.name.toLowerCase()
      const matched = (json.results ?? []).filter((a) =>
        (a['Recipient Name'] ?? '').toLowerCase().includes(needle),
      )
      return mapUsaSpendingAwards(matched)
    } catch {
      return []
    } finally {
      clearTimeout(timeout)
    }
  },
}
