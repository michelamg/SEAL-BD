import type { SignalType } from '@/lib/scoring'
import type { LeadSource, RawSignal, SourceCompany } from './types'

// SEC EDGAR full-text search — free, authoritative, no API key. SEC requires a
// descriptive User-Agent with contact info or it returns 403.
const EDGAR_FTS = 'https://efts.sec.gov/LATEST/search-index'
const USER_AGENT = process.env.SEC_EDGAR_UA || 'Seal Team BD (Cushman & Wakefield) contact@example.com'
const FORMS = '8-K,S-1,S-1/A,424B4,10-K,10-Q'

// Form → signal type + human label. Registration/offering forms read as funding.
function classifyForm(form: string): { type: SignalType; label: string } {
  const f = form.toUpperCase()
  if (f.startsWith('S-1') || f.startsWith('424B')) return { type: 'funding', label: 'Securities offering / registration' }
  if (f.startsWith('8-K')) return { type: 'filing', label: 'Material event (8-K)' }
  return { type: 'filing', label: form }
}

interface EdgarHit {
  _id?: string
  _source?: {
    form?: string
    file_date?: string
    display_names?: string[]
  }
}

interface EdgarResponse {
  hits?: { hits?: EdgarHit[] }
}

// Pure: turn an EDGAR full-text-search JSON response into normalized signals.
// Network-free so it is unit-testable against a fixture.
export function parseEdgarHits(json: EdgarResponse, limit = 5): RawSignal[] {
  const hits = json?.hits?.hits ?? []
  const signals: RawSignal[] = []
  for (const hit of hits.slice(0, limit)) {
    const form = hit._source?.form
    const fileDate = hit._source?.file_date
    if (!form) continue
    const { type, label } = classifyForm(form)
    const display = hit._source?.display_names?.[0] ?? ''
    signals.push({
      type,
      summary: `${label}${display ? ` — ${display.replace(/\s*\(CIK.*\)\s*$/, '').trim()}` : ''}`,
      observed_at: fileDate ?? null,
      source: 'SEC EDGAR',
      source_url: edgarDocUrl(hit, display),
      confidence: 'verified', // SEC filings are authoritative
    })
  }
  return signals
}

// Best-effort archive URL from the hit id ("ACCESSION:FILENAME") + the CIK
// embedded in display_names. Falls back to the EDGAR search page.
function edgarDocUrl(hit: EdgarHit, display: string): string | undefined {
  const id = hit._id
  const cik = display.match(/CIK\s*(\d+)/i)?.[1]
  if (id && cik) {
    const [accession, filename] = id.split(':')
    const accNoDash = accession?.replace(/-/g, '')
    if (accNoDash) {
      const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accNoDash}`
      return filename ? `${base}/${filename}` : `${base}/`
    }
  }
  return undefined
}

export const secEdgarSource: LeadSource = {
  name: 'SEC EDGAR',
  enabled: true,
  async fetchSignals(company: SourceCompany): Promise<RawSignal[]> {
    const params = new URLSearchParams({ q: `"${company.name}"`, forms: FORMS })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(`${EDGAR_FTS}?${params.toString()}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller.signal,
      })
      if (!res.ok) return []
      const json = (await res.json()) as EdgarResponse
      return parseEdgarHits(json)
    } catch {
      return [] // a flaky source never breaks the pipeline
    } finally {
      clearTimeout(timeout)
    }
  },
}
