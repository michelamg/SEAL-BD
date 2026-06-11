import { describe, it, expect } from 'vitest'
import { buildPermitQueryUrl, mapPermitRows, permitsSource, type PermitDataset } from './permits'

const ds: PermitDataset = {
  domain: 'data.sandiegocounty.gov',
  datasetId: 'dyzh-7eat',
  nameField: 'applicant',
  dateField: 'issue_date',
  descField: 'permit_type',
  addressField: 'address',
}

// URLSearchParams encodes spaces as '+'; normalize them back for assertions.
const decode = (url: string) => decodeURIComponent(url.replace(/\+/g, ' '))

describe('buildPermitQueryUrl', () => {
  it('builds a case-insensitive SoQL query ordered by date', () => {
    const url = buildPermitQueryUrl(ds, 'Acme')
    expect(url).toContain('https://data.sandiegocounty.gov/resource/dyzh-7eat.json?')
    expect(decode(url)).toContain("upper(applicant) like upper('%Acme%')")
    expect(decode(url)).toContain('issue_date DESC')
    expect(decode(url)).toContain('limit=5')
  })
  it('escapes single quotes to prevent SoQL injection', () => {
    expect(decode(buildPermitQueryUrl(ds, "O'Brien Corp"))).toContain("O''Brien Corp")
  })
})

describe('mapPermitRows', () => {
  it('maps rows to verified expansion signals', () => {
    const rows = [{ applicant: 'Acme', issue_date: '2026-05-09T00:00:00.000', permit_type: 'Tenant Improvement', address: '123 Main St' }]
    const signals = mapPermitRows(rows, ds)
    expect(signals[0]).toMatchObject({ type: 'expansion', source: 'Permits (data.sandiegocounty.gov)', confidence: 'verified', observed_at: '2026-05-09' })
    expect(signals[0].summary).toContain('Tenant Improvement')
    expect(signals[0].summary).toContain('123 Main St')
  })
  it('handles missing optional fields and bad dates', () => {
    const signals = mapPermitRows([{ applicant: 'Acme' }], { domain: 'd', datasetId: 'x', nameField: 'applicant' })
    expect(signals[0].type).toBe('expansion')
    expect(signals[0].observed_at).toBeNull()
  })
})

describe('permitsSource', () => {
  it('is disabled until PERMITS_DATASETS is configured (no network)', async () => {
    expect(permitsSource.enabled).toBe(false)
    await expect(permitsSource.fetchSignals({ name: 'Acme' })).resolves.toEqual([])
  })
})
