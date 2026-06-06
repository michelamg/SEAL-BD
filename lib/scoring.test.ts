import { describe, it, expect } from 'vitest'
import {
  scoreLead,
  freshness,
  corroborationMultiplier,
  monthsUntil,
  FACTOR_MAX,
  type CompanyInput,
  type SignalInput,
} from './scoring'

// Fixed "now" so every test is deterministic.
const NOW = new Date('2026-06-06T00:00:00Z')

// n days before NOW, as an ISO date string.
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10)
}

describe('config invariants', () => {
  it('factor weights sum to 100', () => {
    const total = Object.values(FACTOR_MAX).reduce((a, b) => a + b, 0)
    expect(total).toBe(100)
  })
})

describe('freshness decay (D9)', () => {
  it('a brand-new funding signal is full weight', () => {
    expect(freshness('funding', daysAgo(3), NOW)).toBeCloseTo(1, 5)
  })
  it('funding at ~3 months is roughly half weight', () => {
    expect(freshness('funding', daysAgo(90), NOW)).toBeCloseTo(0.5, 1)
  })
  it('funding at ~6 months has decayed to zero', () => {
    expect(freshness('funding', daysAgo(180), NOW)).toBeCloseTo(0, 5)
  })
  it('a near-future event (within grace) is treated as fresh', () => {
    expect(freshness('funding', daysAgo(-10), NOW)).toBe(1)
  })
  it('an implausibly future-dated event is not trusted as fresh', () => {
    expect(freshness('funding', daysAgo(-90), NOW)).toBe(0.4)
  })
  it('an unknown date gets partial credit only', () => {
    expect(freshness('funding', null, NOW)).toBe(0.4)
    expect(freshness('funding', 'not-a-date', NOW)).toBe(0.4)
  })
  it('lease signals are exempt from freshness decay', () => {
    expect(freshness('lease', daysAgo(999), NOW)).toBe(1)
  })
})

describe('corroboration (D10)', () => {
  it('rewards multi-source signals', () => {
    expect(corroborationMultiplier(1)).toBe(1.0)
    expect(corroborationMultiplier(2)).toBe(1.2)
    expect(corroborationMultiplier(4)).toBe(1.3)
    expect(corroborationMultiplier(undefined)).toBe(1.0)
  })
})

describe('monthsUntil', () => {
  it('computes positive months for a future lease', () => {
    const m = monthsUntil('2027-06-06', NOW)
    expect(m).not.toBeNull()
    expect(Math.round(m as number)).toBe(12)
  })
  it('returns negative for an expired lease', () => {
    expect(monthsUntil('2025-06-06', NOW) as number).toBeLessThan(0)
  })
  it('returns null for missing/invalid dates', () => {
    expect(monthsUntil(null, NOW)).toBeNull()
    expect(monthsUntil('garbage', NOW)).toBeNull()
  })
})

describe('scoreLead — hot lead', () => {
  const company: CompanyInput = {
    vertical: 'Life Sci',
    employee_count: 240,
    estimated_sf: 30_000,
    current_lease_expiration: '2027-06-06', // ~12mo out → sweet spot
    lease_clock_confidence: 'verified',
    contacts: [{ is_c_suite: true, email: 'ceo@acme.com' }],
    target_verticals: ['Life Sci', 'Tech'],
  }
  const signals: SignalInput[] = [
    { type: 'funding', observed_at: daysAgo(10), confidence: 'verified', corroboration_count: 2, source: 'SEC EDGAR' },
    { type: 'expansion', observed_at: daysAgo(20), confidence: 'verified', source: 'SerpAPI' },
  ]

  it('scores hot (>=70) and recommends immediate outreach', () => {
    const card = scoreLead(company, signals, NOW)
    expect(card.score).toBeGreaterThanOrEqual(70)
    expect(card.band).toBe('hot')
    expect(card.recommendedAction.toLowerCase()).toContain('now')
  })

  it('flags the lease as verified (not estimated)', () => {
    const card = scoreLead(company, signals, NOW)
    expect(card.lease.confidence).toBe('verified')
    expect(card.lease.monthsToExpiry).toBe(12)
    const leaseFactor = card.factors.find((f) => f.key === 'lease')!
    expect(leaseFactor.points).toBe(FACTOR_MAX.lease) // full sweet-spot credit
  })

  it('counts corroborated signals', () => {
    const card = scoreLead(company, signals, NOW)
    expect(card.corroboratedSignals).toBe(1)
  })

  it('every factor carries a rationale (auditability)', () => {
    const card = scoreLead(company, signals, NOW)
    expect(card.factors).toHaveLength(6)
    for (const f of card.factors) {
      expect(f.rationale.length).toBeGreaterThan(0)
      expect(f.points).toBeLessThanOrEqual(f.max)
      expect(f.points).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('scoreLead — cold / empty lead', () => {
  it('an empty company scores cold', () => {
    const card = scoreLead({}, [], NOW)
    expect(card.band).toBe('cold')
    expect(card.score).toBeLessThan(30)
    expect(card.corroboratedSignals).toBe(0)
  })

  it('a stale-only signal does not reach the hot queue (D9)', () => {
    const stale = scoreLead({ vertical: 'Tech', employee_count: 200 }, [{ type: 'funding', observed_at: daysAgo(300) }], NOW)
    expect(stale.band).not.toBe('hot')
  })
})

describe('lease signals are not double-counted', () => {
  it('a lease-type signal contributes nothing to the trigger-signal factor', () => {
    const card = scoreLead(
      { vertical: 'Tech', employee_count: 200 },
      [{ type: 'lease', observed_at: daysAgo(10), confidence: 'verified' }],
      NOW,
    )
    const sigFactor = card.factors.find((f) => f.key === 'signals')!
    expect(sigFactor.points).toBe(0) // scored by the lease factor only
  })
})

describe('lease flagging (D3)', () => {
  it('defaults lease timing to unverified and says so', () => {
    const card = scoreLead({ current_lease_expiration: '2027-06-06' }, [], NOW)
    expect(card.lease.confidence).toBe('unverified')
    const leaseFactor = card.factors.find((f) => f.key === 'lease')!
    expect(leaseFactor.rationale.toLowerCase()).toContain('best-effort')
  })

  it('reports unknown lease timing when there is no date', () => {
    const card = scoreLead({}, [], NOW)
    expect(card.lease.monthsToExpiry).toBeNull()
  })
})

describe('verified beats unverified', () => {
  it('a verified signal outscores the same signal unverified', () => {
    const base: CompanyInput = { vertical: 'Tech', employee_count: 200 }
    const verified = scoreLead(base, [{ type: 'funding', observed_at: daysAgo(10), confidence: 'verified' }], NOW)
    const unverified = scoreLead(base, [{ type: 'funding', observed_at: daysAgo(10), confidence: 'unverified' }], NOW)
    expect(verified.score).toBeGreaterThan(unverified.score)
  })
})

describe('reachability tiers', () => {
  const sigs: SignalInput[] = [{ type: 'funding', observed_at: daysAgo(10), confidence: 'verified' }]
  it('rewards a decision-maker email over no contacts', () => {
    const withDM = scoreLead({ contacts: [{ is_c_suite: true, email: 'x@y.com' }] }, sigs, NOW)
    const none = scoreLead({ contacts: [] }, sigs, NOW)
    const dmPts = withDM.factors.find((f) => f.key === 'reachability')!.points
    const nonePts = none.factors.find((f) => f.key === 'reachability')!.points
    expect(dmPts).toBe(FACTOR_MAX.reachability)
    expect(nonePts).toBe(0)
  })
})

describe('determinism & bounds', () => {
  const company: CompanyInput = { vertical: 'Defense', employee_count: 800, estimated_sf: 50_000 }
  const signals: SignalInput[] = [
    { type: 'gov_contract', observed_at: daysAgo(30), confidence: 'verified', corroboration_count: 3 },
    { type: 'hiring', observed_at: daysAgo(15) },
    { type: 'funding', observed_at: daysAgo(5), confidence: 'verified' },
  ]
  it('produces identical output for identical input', () => {
    expect(scoreLead(company, signals, NOW)).toEqual(scoreLead(company, signals, NOW))
  })
  it('never exceeds 0–100 even when piling on signals', () => {
    const many: SignalInput[] = Array.from({ length: 20 }, () => ({
      type: 'funding' as const,
      observed_at: daysAgo(1),
      confidence: 'verified' as const,
      corroboration_count: 5,
    }))
    const card = scoreLead(company, many, NOW)
    expect(card.score).toBeLessThanOrEqual(100)
    expect(card.score).toBeGreaterThanOrEqual(0)
    const signalFactor = card.factors.find((f) => f.key === 'signals')!
    expect(signalFactor.points).toBe(FACTOR_MAX.signals) // capped
  })
})
