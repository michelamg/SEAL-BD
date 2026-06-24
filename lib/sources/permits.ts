import { fetchJsonSafe } from '@/lib/http'
import { nameMatches } from './match'
import type { LeadSource, RawSignal, SourceCompany } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Building-permits source connector (Socrata open-data portals).
//
// Tenant-improvement and new-construction permits are a leading indicator of
// space activity (buildout, relocation, growth). Permit data is fragmented by
// jurisdiction, so this is a generic Socrata SoQL connector: configure one or
// more datasets via PERMITS_DATASETS (JSON) and it queries each by applicant/
// owner name. Free, no key (an optional SOCRATA_APP_TOKEN raises rate limits).
//
// Example (San Diego County): data.sandiegocounty.gov dataset dyzh-7eat. Confirm
// the column names against the dataset schema before relying on it in prod.
// Disabled until at least one dataset is configured → zero network by default.
// ─────────────────────────────────────────────────────────────────────────────

export interface PermitDataset {
  domain: string // e.g. 'data.sandiegocounty.gov'
  datasetId: string // Socrata 4x4 id, e.g. 'dyzh-7eat'
  nameField: string // column holding applicant/owner/business name
  dateField?: string // issue/application date column
  descField?: string // permit type / description column
  addressField?: string // site address column
}

function loadDatasets(): PermitDataset[] {
  const raw = process.env.PERMITS_DATASETS
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PermitDataset[]) : []
  } catch {
    return []
  }
}

const DATASETS = loadDatasets()
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN

function parseIsoDate(raw: string): string | null {
  if (!raw) return null
  const t = Date.parse(raw)
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10)
}

// Build a Socrata SoQL query: case-insensitive applicant-name match, newest first.
export function buildPermitQueryUrl(ds: PermitDataset, companyName: string, limit = 5): string {
  const safe = companyName.replace(/'/g, "''") // escape single quotes for SoQL
  const params = new URLSearchParams({
    $where: `upper(${ds.nameField}) like upper('%${safe}%')`,
    $limit: String(limit),
  })
  if (ds.dateField) params.set('$order', `${ds.dateField} DESC`)
  return `https://${ds.domain}/resource/${ds.datasetId}.json?${params.toString()}`
}

// Map Socrata permit rows → verified expansion signals (a permit = active space work).
// When `companyName` is given, rows whose applicant/owner name doesn't actually
// match are dropped — the SoQL `like '%name%'` over-matches (e.g. 'IBM' ⊂ 'ZIBMAT'),
// and a mis-attributed permit stored confidence:'verified' would corrupt the score.
export function mapPermitRows(rows: Record<string, unknown>[], ds: PermitDataset, companyName?: string): RawSignal[] {
  const matched = companyName
    ? rows.filter((r) => nameMatches(String(r[ds.nameField] ?? ''), companyName))
    : rows
  return matched.map((r) => {
    const desc = ds.descField ? String(r[ds.descField] ?? '') : ''
    const addr = ds.addressField ? String(r[ds.addressField] ?? '') : ''
    const date = ds.dateField ? String(r[ds.dateField] ?? '') : ''
    const summary = `Building permit${desc ? `: ${desc}` : ''}${addr ? ` @ ${addr}` : ''}`
    return {
      type: 'expansion' as const,
      summary: summary.slice(0, 300),
      observed_at: parseIsoDate(date),
      source: `Permits (${ds.domain})`,
      source_url: `https://${ds.domain}/d/${ds.datasetId}`,
      confidence: 'verified' as const,
    }
  })
}

export const permitsSource: LeadSource = {
  name: 'Building Permits',
  enabled: DATASETS.length > 0,
  async fetchSignals(company: SourceCompany): Promise<RawSignal[]> {
    if (DATASETS.length === 0) return []
    const perDataset = await Promise.allSettled(
      DATASETS.map(async (ds) => {
        const rows = await fetchJsonSafe<Record<string, unknown>[]>(
          buildPermitQueryUrl(ds, company.name),
          { headers: APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {} },
          [],
        )
        return mapPermitRows(Array.isArray(rows) ? rows : [], ds, company.name)
      }),
    )
    return perDataset.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  },
}
