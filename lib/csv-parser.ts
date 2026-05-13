import { parse } from 'csv-parse/sync'
import type { PitchbookCompany } from '@/types'

// Maps common PitchBook column names to our schema
const PITCHBOOK_FIELD_MAP: Record<string, keyof PitchbookCompany> = {
  'Company Name': 'company_name',
  'Company': 'company_name',
  'Description': 'description',
  'Industry': 'industry',
  'Website': 'website',
  'HQ Location': 'hq_location',
  'HQ City/State/Country': 'hq_location',
  'Number of Employees': 'employee_count',
  'Employees': 'employee_count',
  'Total Raised': 'total_funding',
  'Total Funding': 'total_funding',
  'Last Financing Type': 'last_funding_type',
  'Last Deal Type': 'last_funding_type',
  'Last Financing Date': 'last_funding_date',
  'Last Deal Date': 'last_funding_date',
  'Last Financing Size': 'last_funding_amount',
  'Last Deal Size': 'last_funding_amount',
  'Lead Investors': 'investors',
  'Investors': 'investors',
  'CEO': 'ceo_name',
  'CFO': 'cfo_name',
  'Revenue': 'revenue',
}

export function parsePitchbookCSV(csvContent: string): Partial<PitchbookCompany>[] {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[]

  return records.map((row) => {
    const mapped: Partial<PitchbookCompany> & { raw_data: Record<string, unknown> } = {
      raw_data: row,
      status: 'new',
    }

    for (const [csvCol, schemaField] of Object.entries(PITCHBOOK_FIELD_MAP)) {
      if (row[csvCol] !== undefined && row[csvCol] !== '') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(mapped as any)[schemaField] = row[csvCol]
      }
    }

    // Parse date fields
    if (mapped.last_funding_date) {
      const d = new Date(mapped.last_funding_date as string)
      if (!isNaN(d.getTime())) {
        mapped.last_funding_date = d.toISOString().split('T')[0]
      } else {
        delete mapped.last_funding_date
      }
    }

    return mapped
  })
}

export function parseCompsCSV(csvContent: string) {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[]

  return records.map((row) => ({
    tenant_name: row['Tenant'] || row['Tenant Name'] || row['Company'] || '',
    address: row['Address'] || row['Street Address'] || '',
    city: row['City'] || '',
    state: row['State'] || '',
    submarket: row['Submarket'] || '',
    size_sf: parseFloat(row['SF'] || row['Size (SF)'] || row['Leased SF'] || '0') || undefined,
    rate_per_sf: parseFloat(row['Rate'] || row['$/SF/YR'] || row['Asking Rate'] || '0') || undefined,
    lease_term: row['Term'] || row['Lease Term'] || '',
    lease_type: row['Type'] || row['Lease Type'] || '',
    deal_date: row['Date'] || row['Deal Date'] || row['Execution Date'] || '',
    vertical: undefined,
    source: 'upload',
  }))
}
