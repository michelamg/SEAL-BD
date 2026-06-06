import { describe, it, expect } from 'vitest'
import { parseEdgarHits } from './sec-edgar'
import { corroborate } from './index'
import type { RawSignal } from './types'

describe('parseEdgarHits', () => {
  const fixture = {
    hits: {
      hits: [
        {
          _id: '0000320193-24-000123:acme-8k.htm',
          _source: { form: '8-K', file_date: '2026-05-29', display_names: ['Acme Therapeutics Inc. (ACME) (CIK 0001234567)'] },
        },
        {
          _id: '0001234567-26-000001:s1.htm',
          _source: { form: 'S-1', file_date: '2026-05-01', display_names: ['Acme Therapeutics Inc. (CIK 0001234567)'] },
        },
      ],
    },
  }

  it('maps each filing to a verified signal from SEC EDGAR', () => {
    const out = parseEdgarHits(fixture)
    expect(out).toHaveLength(2)
    expect(out.every((s) => s.confidence === 'verified' && s.source === 'SEC EDGAR')).toBe(true)
  })

  it('classifies S-1 as funding and 8-K as filing', () => {
    const out = parseEdgarHits(fixture)
    expect(out[0].type).toBe('filing') // 8-K
    expect(out[1].type).toBe('funding') // S-1
  })

  it('builds an archive URL from accession + CIK', () => {
    const out = parseEdgarHits(fixture)
    expect(out[0].source_url).toBe('https://www.sec.gov/Archives/edgar/data/1234567/000032019324000123/acme-8k.htm')
  })

  it('strips the CIK suffix from the company display name', () => {
    const out = parseEdgarHits(fixture)
    expect(out[0].summary).toContain('Acme Therapeutics Inc.')
    expect(out[0].summary).not.toContain('CIK')
  })

  it('is robust to an empty / malformed response', () => {
    expect(parseEdgarHits({})).toEqual([])
    expect(parseEdgarHits({ hits: { hits: [] } })).toEqual([])
  })
})

describe('corroborate (D10)', () => {
  const base = (over: Partial<RawSignal>): RawSignal => ({
    type: 'funding',
    summary: '',
    source: 'X',
    confidence: 'verified',
    ...over,
  })

  it('counts independent sources confirming the same signal type in-window', () => {
    const out = corroborate([
      base({ source: 'SEC EDGAR', observed_at: '2026-05-29' }),
      base({ source: 'Apollo', observed_at: '2026-05-20', confidence: 'unverified' }),
      base({ type: 'hiring', source: 'SerpAPI', observed_at: '2026-05-25', confidence: 'unverified' }),
    ])
    const funding = out.filter((s) => s.type === 'funding')
    expect(funding.every((s) => s.corroboration_count === 2)).toBe(true)
    expect(out.find((s) => s.type === 'hiring')!.corroboration_count).toBe(1)
  })

  it('does not corroborate the same type across out-of-window dates', () => {
    const out = corroborate([
      base({ source: 'SEC EDGAR', observed_at: '2026-05-29' }),
      base({ source: 'Apollo', observed_at: '2025-01-01' }),
    ])
    expect(out.every((s) => s.corroboration_count === 1)).toBe(true)
  })
})
