import { describe, it, expect } from 'vitest'
import { mapUsaSpendingAwards, usaSpendingSource, type UsaSpendingAward } from './usaspending'

describe('mapUsaSpendingAwards', () => {
  it('maps federal awards to verified gov_contract signals', () => {
    const awards: UsaSpendingAward[] = [
      {
        'Recipient Name': 'Acme Defense Inc',
        'Award Amount': 4200000,
        'Start Date': '2026-05-10',
        Description: 'Engineering services',
        generated_internal_id: 'CONT_AWD_123',
      },
    ]
    const signals = mapUsaSpendingAwards(awards)
    expect(signals).toHaveLength(1)
    expect(signals[0]).toMatchObject({
      type: 'gov_contract',
      source: 'USASpending.gov',
      confidence: 'verified',
      observed_at: '2026-05-10',
      source_url: 'https://www.usaspending.gov/award/CONT_AWD_123',
    })
    expect(signals[0].summary).toContain('$4,200,000')
    expect(signals[0].summary).toContain('Engineering services')
  })

  it('handles missing fields gracefully', () => {
    const signals = mapUsaSpendingAwards([{ 'Recipient Name': 'X' }])
    expect(signals[0].type).toBe('gov_contract')
    expect(signals[0].observed_at).toBeNull()
    expect(signals[0].source_url).toBe('https://www.usaspending.gov')
  })

  it('is enabled (free, no key)', () => {
    expect(usaSpendingSource.enabled).toBe(true)
  })
})
