// Lightweight fixed-window rate limiter.
//
// Default backing store is an in-process Map — correct for a single instance and
// a meaningful guardrail against runaway cost on the paid LLM/data routes. On
// serverless (multiple instances) this is per-instance, not global; the interface
// is deliberately swappable so a Redis/Upstash store can drop in for C&W
// production without touching call sites. `now` is injectable for tests.

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSec: number
}

interface Bucket {
  count: number
  resetAt: number
}

const store = new Map<string, Bucket>()

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
  now: number = Date.now(),
): RateLimitResult {
  const existing = store.get(key)
  if (!existing || now >= existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs })
    return { ok: true, remaining: opts.limit - 1, retryAfterSec: 0 }
  }
  if (existing.count >= opts.limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) }
  }
  existing.count++
  return { ok: true, remaining: opts.limit - existing.count, retryAfterSec: 0 }
}

// Opportunistic cleanup so the Map doesn't grow unbounded across many keys.
export function pruneRateLimitStore(now: number = Date.now()): void {
  for (const [key, bucket] of store) {
    if (now >= bucket.resetAt) store.delete(key)
  }
}

// Test seam.
export function _resetRateLimitStore(): void {
  store.clear()
}
