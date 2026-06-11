import { describe, it, expect } from 'vitest'
import { mapNewsResults, newsSource, type NewsResult } from './news'

describe('mapNewsResults', () => {
  it('classifies recognizable signals and drops noise', () => {
    const results: NewsResult[] = [
      { title: 'Acme raises $30M Series B', date: '2026-05-01', link: 'https://a', source: { name: 'TechCrunch' } },
      { title: 'Acme names new CFO', date: 'May 3, 2026', link: 'https://b', source: 'PRNewswire' },
      { title: 'Acme sponsors local 5K run', date: '2026-05-02', link: 'https://c' }, // noise → dropped
    ]
    const signals = mapNewsResults(results)
    expect(signals).toHaveLength(2)
    expect(signals[0]).toMatchObject({ type: 'funding', confidence: 'unverified', source: 'News (TechCrunch)', observed_at: '2026-05-01' })
    expect(signals[1]).toMatchObject({ type: 'leadership', source: 'News (PRNewswire)' })
  })

  it('nulls out unparseable/relative dates', () => {
    const signals = mapNewsResults([{ title: 'Acme expansion to Austin', date: '2 days ago' }])
    expect(signals).toHaveLength(1)
    expect(signals[0].observed_at).toBeNull()
    expect(signals[0].type).toBe('expansion')
  })

  it('is disabled without SERP_API_KEY (no spend)', async () => {
    expect(newsSource.enabled).toBe(false)
    await expect(newsSource.fetchSignals({ name: 'Acme' })).resolves.toEqual([])
  })
})
