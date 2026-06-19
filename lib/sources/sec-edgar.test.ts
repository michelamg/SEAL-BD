import { describe, it, expect } from 'vitest'
import { parseEdgarHits, secEdgarSource } from './sec-edgar'

// A realistic EDGAR full-text-search hit. `_id` is "ACCESSION:FILENAME" and the
// CIK is embedded in display_names — both feed the archive-URL builder.
function hit(form: string, opts: { date?: string; name?: string; id?: string } = {}) {
  return {
    _id: opts.id ?? '0001193125-26-000123:d12345d8k.htm',
    _source: {
      form,
      file_date: opts.date ?? '2026-05-01',
      display_names: opts.name === undefined ? ['ACME CORP  (CIK 0000123456)'] : [opts.name],
    },
  }
}

describe('parseEdgarHits', () => {
  it('classifies registration/offering forms as funding and 8-K as a filing', () => {
    const signals = parseEdgarHits({ hits: { hits: [hit('S-1'), hit('424B4'), hit('8-K')] } })
    expect(signals).toHaveLength(3)
    expect(signals[0]).toMatchObject({ type: 'funding', confidence: 'verified', source: 'SEC EDGAR' })
    expect(signals[0].summary).toContain('Securities offering / registration')
    expect(signals[1].type).toBe('funding') // 424B4
    expect(signals[2]).toMatchObject({ type: 'filing' })
    expect(signals[2].summary).toContain('Material event (8-K)')
  })

  it('strips the trailing "(CIK …)" from the display name in the summary', () => {
    const [s] = parseEdgarHits({ hits: { hits: [hit('8-K')] } })
    expect(s.summary).toBe('Material event (8-K) — ACME CORP')
    expect(s.observed_at).toBe('2026-05-01')
  })

  it('builds the archive doc URL from the accession id + CIK', () => {
    const [s] = parseEdgarHits({ hits: { hits: [hit('8-K')] } })
    expect(s.source_url).toBe(
      'https://www.sec.gov/Archives/edgar/data/123456/000119312526000123/d12345d8k.htm',
    )
  })

  it('leaves source_url undefined when the CIK is missing', () => {
    const [s] = parseEdgarHits({ hits: { hits: [hit('8-K', { name: 'ACME CORP' })] } })
    expect(s.source_url).toBeUndefined()
  })

  it('skips hits with no form', () => {
    const hits = [hit('8-K'), { _source: { file_date: '2026-01-01' } }, hit('S-1')]
    expect(parseEdgarHits({ hits: { hits } })).toHaveLength(2) // formless one dropped
  })

  it('caps results at the limit (slice before classify)', () => {
    const hits = [hit('8-K'), hit('S-1'), hit('10-K'), hit('10-Q'), hit('8-K')]
    expect(parseEdgarHits({ hits: { hits } }, 3)).toHaveLength(3)
  })

  it('returns [] for an empty/shapeless response', () => {
    expect(parseEdgarHits({})).toEqual([])
    expect(parseEdgarHits({ hits: { hits: [] } })).toEqual([])
  })
})

describe('secEdgarSource', () => {
  it('is in the free always-on layer (no API key required)', () => {
    expect(secEdgarSource.enabled).toBe(true)
    expect(secEdgarSource.name).toBe('SEC EDGAR')
  })
})
