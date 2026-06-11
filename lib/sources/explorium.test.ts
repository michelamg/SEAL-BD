import { describe, it, expect } from 'vitest'
import { classifyExploriumEvent, mapExploriumEvents, exploriumSource, type ExploriumEvent } from './explorium'

describe('classifyExploriumEvent', () => {
  it('maps event categories to the signal taxonomy', () => {
    expect(classifyExploriumEvent('funding_round')).toBe('funding')
    expect(classifyExploriumEvent('ipo')).toBe('funding')
    expect(classifyExploriumEvent('new_executive')).toBe('leadership')
    expect(classifyExploriumEvent('office_expansion')).toBe('expansion')
    expect(classifyExploriumEvent('headcount_growth')).toBe('hiring')
    expect(classifyExploriumEvent('gov_contract_award')).toBe('gov_contract')
  })
  it('falls back to text inference for unknown event types', () => {
    expect(classifyExploriumEvent('misc', 'Closed a Series C')).toBe('funding')
    expect(classifyExploriumEvent('misc', 'quarterly newsletter')).toBe('other')
  })
})

describe('mapExploriumEvents', () => {
  it('normalizes events into verified RawSignals from Explorium', () => {
    const events: ExploriumEvent[] = [
      { event_type: 'funding_round', event_time: '2026-05-20', summary: '$40M Series C', url: 'https://x' },
      { event_type: 'new_executive', event_time: '2026-04-01', title: 'New CFO appointed' },
    ]
    const signals = mapExploriumEvents(events)
    expect(signals).toHaveLength(2)
    expect(signals[0]).toMatchObject({ type: 'funding', source: 'Explorium', confidence: 'verified', observed_at: '2026-05-20', source_url: 'https://x' })
    expect(signals[1]).toMatchObject({ type: 'leadership', source: 'Explorium', confidence: 'verified' })
  })
  it('handles empty input', () => {
    expect(mapExploriumEvents([])).toEqual([])
  })
})

describe('exploriumSource', () => {
  it('is disabled by default (no credits/network until EXPLORIUM_ENABLED + key)', async () => {
    expect(exploriumSource.enabled).toBe(false)
    // Disabled → returns [] without any network call.
    await expect(exploriumSource.fetchSignals({ name: 'Acme' })).resolves.toEqual([])
  })
})
