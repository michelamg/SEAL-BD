import { describe, it, expect } from 'vitest'
import { parseCompsCSV, parsePitchbookCSV } from './csv-parser'

describe('parseCompsCSV', () => {
  it('normalizes deal_date and emits null for a missing date (not "")', () => {
    // A '' into a Postgres DATE column fails the whole insert batch — one undated
    // row must not poison the upload. This is the P1 fix.
    const rows = parseCompsCSV('Tenant,Date,SF,Rate\nAcme,2026-05-01,"12,500",45\nBeta,,5000,30\n')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ tenant_name: 'Acme', deal_date: '2026-05-01', size_sf: 12500, rate_per_sf: 45 })
    expect(rows[1].deal_date).toBeNull() // missing date → null, not ''
    expect(rows[1].size_sf).toBe(5000)
  })

  it('emits null for an unparseable date', () => {
    const [row] = parseCompsCSV('Tenant,Date\nAcme,not-a-date\n')
    expect(row.deal_date).toBeNull()
  })

  it('falls back across column aliases for tenant/size', () => {
    const [row] = parseCompsCSV('Company,Leased SF\nAcme,8000\n')
    expect(row.tenant_name).toBe('Acme')
    expect(row.size_sf).toBe(8000)
  })

  it('applies magnitude suffixes and strips separators/currency', () => {
    const [row] = parseCompsCSV('Tenant,SF,Rate\nAcme,1.2M,"$45.50"\n')
    expect(row.size_sf).toBe(1_200_000) // not 1.2 — the M must multiply
    expect(row.rate_per_sf).toBe(45.5)
    const [row2] = parseCompsCSV('Tenant,SF\nBeta,"12,500"\n')
    expect(row2.size_sf).toBe(12500)
  })
})

describe('parsePitchbookCSV', () => {
  it('neutralizes formula injection in raw_data', () => {
    const [row] = parsePitchbookCSV('Company Name,Notes\nAcme,=cmd|/c calc\n')
    expect(row.company_name).toBe('Acme')
    expect((row.raw_data as Record<string, unknown>)['Notes']).toBe("'=cmd|/c calc")
  })

  it('normalizes a valid funding date and drops an unparseable one', () => {
    const [a] = parsePitchbookCSV('Company Name,Last Financing Date\nAcme,2026-03-15\n')
    expect(a.last_funding_date).toBe('2026-03-15')
    const [b] = parsePitchbookCSV('Company Name,Last Financing Date\nBeta,garbage\n')
    expect(b.last_funding_date).toBeUndefined()
  })
})
