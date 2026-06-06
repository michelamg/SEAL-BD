// ─────────────────────────────────────────────────────────────────────────────
// Salesforce export — configurable field mapping (D7).
//
// C&W owns Salesforce; we do NOT write to it directly (their IT owns that
// connection). Instead we export a CSV in their Salesforce-import format, with a
// mapping layer (our field → their SF field) that can be adjusted without code
// once we have their admin's field schema. Default mapping targets standard Lead
// fields plus a few C&W custom fields; override per deployment.
//
// Pure and side-effect-free — unit-testable end to end.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportContact {
  first_name?: string | null
  last_name?: string | null
  title?: string | null
  email?: string | null
  phone?: string | null
}

export interface ExportCompany {
  name: string
  website?: string | null
  industry?: string | null
  vertical?: string | null
  employee_count?: number | null
  size?: string | null
  city?: string | null
  state?: string | null
  location?: string | null
  stage?: string | null
  priority?: string | null
  trigger_signal?: string | null
  estimated_sf?: number | null
  current_score?: number | null
  owner?: string | null
  notes?: string | null
  primaryContact?: ExportContact | null
}

// Scalar (CSV-serializable) keys of ExportCompany — excludes the nested contact,
// which must be reached via a derive function.
type ScalarKey = Exclude<keyof ExportCompany, 'primaryContact'>

export interface FieldMapping {
  /** Salesforce column header to emit. */
  target: string
  /** Scalar field key on ExportCompany, or a derive function. */
  source: ScalarKey | ((c: ExportCompany) => string | number | null | undefined)
}

// Salesforce Lead "Rating" picklist from the deterministic fit score.
export function ratingFromScore(score: number | null | undefined): string {
  if (score == null) return ''
  if (score >= 70) return 'Hot'
  if (score >= 50) return 'Warm'
  return 'Cold'
}

// Default mapping. Standard Lead fields + C&W custom fields (the __c suffix is
// Salesforce's custom-field convention). Refine target names with C&W's SF admin.
export const DEFAULT_SF_MAPPING: FieldMapping[] = [
  { target: 'Company', source: 'name' },
  { target: 'LastName', source: (c) => c.primaryContact?.last_name || '[Unknown]' }, // SF Leads require LastName
  { target: 'FirstName', source: (c) => c.primaryContact?.first_name ?? '' },
  { target: 'Title', source: (c) => c.primaryContact?.title ?? '' },
  { target: 'Email', source: (c) => c.primaryContact?.email ?? '' },
  { target: 'Phone', source: (c) => c.primaryContact?.phone ?? '' },
  { target: 'Website', source: 'website' },
  { target: 'Industry', source: (c) => c.industry || c.vertical || '' },
  { target: 'NumberOfEmployees', source: (c) => c.employee_count ?? '' },
  { target: 'City', source: (c) => c.city || c.location || '' },
  { target: 'State', source: 'state' },
  { target: 'LeadSource', source: () => 'Seal Team BD' },
  { target: 'Rating', source: (c) => ratingFromScore(c.current_score) },
  { target: 'Description', source: (c) => c.trigger_signal || c.notes || '' },
  { target: 'CW_Vertical__c', source: (c) => c.vertical ?? '' },
  { target: 'CW_Estimated_SF__c', source: (c) => c.estimated_sf ?? '' },
  { target: 'CW_Fit_Score__c', source: (c) => c.current_score ?? '' },
  { target: 'CW_Owner__c', source: (c) => c.owner ?? '' },
]

// RFC-4180 CSV field escaping + formula-injection defense.
//   • Quote when the value contains a comma, quote, or newline; double embedded quotes.
//   • Neutralize spreadsheet formula injection: a value beginning with = + - @ (or
//     a control char) is executed as a formula if the CSV is opened in Excel/Sheets
//     before import, so prefix it with a single quote (OWASP guidance).
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value == null) return ''
  let s = String(value)
  if (typeof value === 'string' && /^[\s\x00-\x1f]*[=+\-@]/.test(s)) s = `'${s}`
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function mapCompanyToSalesforce(
  company: ExportCompany,
  mapping: FieldMapping[] = DEFAULT_SF_MAPPING,
): Record<string, string | number | null | undefined> {
  const row: Record<string, string | number | null | undefined> = {}
  for (const m of mapping) {
    row[m.target] = typeof m.source === 'function' ? m.source(company) : company[m.source]
  }
  return row
}

export interface SalesforceCsv {
  csv: string
  headers: string[]
  rowCount: number
}

export function buildSalesforceCsv(
  companies: ExportCompany[],
  mapping: FieldMapping[] = DEFAULT_SF_MAPPING,
): SalesforceCsv {
  const headers = mapping.map((m) => m.target)
  const lines = [headers.map(escapeCsvField).join(',')]
  for (const company of companies) {
    const row = mapCompanyToSalesforce(company, mapping)
    lines.push(headers.map((h) => escapeCsvField(row[h])).join(','))
  }
  return { csv: lines.join('\r\n'), headers, rowCount: companies.length }
}
