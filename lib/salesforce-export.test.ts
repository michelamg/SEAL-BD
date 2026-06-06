import { describe, it, expect } from 'vitest'
import {
  escapeCsvField,
  ratingFromScore,
  mapCompanyToSalesforce,
  buildSalesforceCsv,
  DEFAULT_SF_MAPPING,
  type ExportCompany,
  type FieldMapping,
} from './salesforce-export'

describe('escapeCsvField', () => {
  it('passes simple values through', () => {
    expect(escapeCsvField('Acme')).toBe('Acme')
    expect(escapeCsvField(42)).toBe('42')
  })
  it('renders null/undefined as empty', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
  })
  it('quotes and escapes commas, quotes, and newlines', () => {
    expect(escapeCsvField('San Diego, CA')).toBe('"San Diego, CA"')
    expect(escapeCsvField('they said "hi"')).toBe('"they said ""hi"""')
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"')
  })
  it('neutralizes spreadsheet formula injection', () => {
    expect(escapeCsvField('=cmd|/c calc')).toBe("'=cmd|/c calc")
    expect(escapeCsvField('@SUM(A1:A9)')).toBe("'@SUM(A1:A9)")
    expect(escapeCsvField('+1-800-EVIL')).toBe("'+1-800-EVIL") // leading + → quote-prefixed
    expect(escapeCsvField('   =cmd')).toBe("'   =cmd") // leading whitespace before formula char
    // numbers are never treated as formulas
    expect(escapeCsvField(-42)).toBe('-42')
  })
})

describe('ratingFromScore', () => {
  it('maps score bands to the Salesforce Rating picklist', () => {
    expect(ratingFromScore(85)).toBe('Hot')
    expect(ratingFromScore(60)).toBe('Warm')
    expect(ratingFromScore(20)).toBe('Cold')
    expect(ratingFromScore(null)).toBe('')
  })
})

const company: ExportCompany = {
  name: 'Genosity Bio',
  website: 'https://genosity.bio',
  vertical: 'Life Sci',
  employee_count: 240,
  city: 'San Diego',
  state: 'CA',
  estimated_sf: 30_000,
  current_score: 94,
  trigger_signal: 'Series C, $40M',
  primaryContact: { first_name: 'Dana', last_name: 'Reed', title: 'CEO', email: 'dana@genosity.bio' },
}

describe('mapCompanyToSalesforce', () => {
  it('maps fields to Salesforce targets, deriving Rating + LeadSource', () => {
    const row = mapCompanyToSalesforce(company)
    expect(row.Company).toBe('Genosity Bio')
    expect(row.LastName).toBe('Reed')
    expect(row.Rating).toBe('Hot')
    expect(row.LeadSource).toBe('Seal Team BD')
    expect(row.CW_Fit_Score__c).toBe(94)
  })

  it('substitutes a placeholder LastName when no contact (SF requires it)', () => {
    const row = mapCompanyToSalesforce({ name: 'NoContact Inc' })
    expect(row.LastName).toBe('[Unknown]')
  })

  it('honors a custom mapping override', () => {
    const custom: FieldMapping[] = [
      { target: 'Account Name', source: 'name' },
      { target: 'Score__c', source: 'current_score' },
    ]
    const row = mapCompanyToSalesforce(company, custom)
    expect(Object.keys(row)).toEqual(['Account Name', 'Score__c'])
    expect(row['Account Name']).toBe('Genosity Bio')
  })
})

describe('buildSalesforceCsv', () => {
  it('produces a header row + one row per company', () => {
    const { csv, headers, rowCount } = buildSalesforceCsv([company])
    const lines = csv.split('\r\n')
    expect(headers).toEqual(DEFAULT_SF_MAPPING.map((m) => m.target))
    expect(rowCount).toBe(1)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(headers.join(','))
    expect(lines[1]).toContain('Genosity Bio')
  })

  it('keeps columns aligned when a value contains a comma', () => {
    const { csv } = buildSalesforceCsv([company])
    const dataLine = csv.split('\r\n')[1]
    // The trigger_signal "Series C, $40M" must be quoted, not split into two cells.
    expect(dataLine).toContain('"Series C, $40M"')
  })

  it('emits just headers for an empty list', () => {
    const { csv, rowCount } = buildSalesforceCsv([])
    expect(rowCount).toBe(0)
    expect(csv.split('\r\n')).toHaveLength(1)
  })
})
