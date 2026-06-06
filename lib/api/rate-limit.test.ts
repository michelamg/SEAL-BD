import { describe, it, expect, beforeEach } from 'vitest'
import { rateLimit, pruneRateLimitStore, _resetRateLimitStore } from './rate-limit'

beforeEach(() => _resetRateLimitStore())

describe('rateLimit', () => {
  it('allows requests up to the limit then blocks', () => {
    const opts = { limit: 3, windowMs: 60_000 }
    expect(rateLimit('k', opts, 1000).ok).toBe(true)
    expect(rateLimit('k', opts, 1000).ok).toBe(true)
    expect(rateLimit('k', opts, 1000).ok).toBe(true)
    const blocked = rateLimit('k', opts, 1000)
    expect(blocked.ok).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSec).toBeGreaterThan(0)
  })

  it('resets after the window elapses', () => {
    const opts = { limit: 1, windowMs: 1000 }
    expect(rateLimit('k', opts, 0).ok).toBe(true)
    expect(rateLimit('k', opts, 500).ok).toBe(false) // still in window
    expect(rateLimit('k', opts, 1000).ok).toBe(true) // window elapsed
  })

  it('tracks keys independently', () => {
    const opts = { limit: 1, windowMs: 60_000 }
    expect(rateLimit('a', opts, 0).ok).toBe(true)
    expect(rateLimit('b', opts, 0).ok).toBe(true) // different key, not blocked
    expect(rateLimit('a', opts, 0).ok).toBe(false)
  })

  it('reports decreasing remaining', () => {
    const opts = { limit: 5, windowMs: 60_000 }
    expect(rateLimit('k', opts, 0).remaining).toBe(4)
    expect(rateLimit('k', opts, 0).remaining).toBe(3)
  })

  it('prunes expired buckets', () => {
    rateLimit('k', { limit: 1, windowMs: 1000 }, 0)
    pruneRateLimitStore(2000)
    // After prune, the key is fresh again.
    expect(rateLimit('k', { limit: 1, windowMs: 1000 }, 2000).ok).toBe(true)
  })
})
