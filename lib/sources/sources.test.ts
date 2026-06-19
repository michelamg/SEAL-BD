import { describe, it, expect } from 'vitest'
import { corroborate, signalKey } from './index'
import type { RawSignal } from './types'

// parseEdgarHits is covered in its sibling sec-edgar.test.ts. This file tests the
// registry/index layer only: corroboration and the shared de-dup key.

describe('signalKey', () => {
  it('produces the same key for a RawSignal and its stored-row twin', () => {
    // The refresh route keys gathered signals (`type`) and DB rows (`signal_type`)
    // through this one helper — they must collide for de-dup to work.
    const gathered = signalKey({ source: 'SEC EDGAR', type: 'funding', observed_at: '2026-05-01' })
    const stored = signalKey({ source: 'SEC EDGAR', type: 'funding', observed_at: '2026-05-01' })
    expect(gathered).toBe(stored)
  })

  it('treats null and missing observed_at identically', () => {
    expect(signalKey({ source: 'News', type: 'expansion', observed_at: null })).toBe(
      signalKey({ source: 'News', type: 'expansion' }),
    )
  })

  it('distinguishes different source, type, or date', () => {
    const base = { source: 'News', type: 'funding' as const, observed_at: '2026-05-01' }
    expect(signalKey(base)).not.toBe(signalKey({ ...base, source: 'SEC EDGAR' }))
    expect(signalKey(base)).not.toBe(signalKey({ ...base, type: 'hiring' }))
    expect(signalKey(base)).not.toBe(signalKey({ ...base, observed_at: '2026-05-02' }))
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
