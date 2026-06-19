// Shared HTTP helpers. Centralizes the AbortController + timeout dance that every
// external-data call needs, so connectors don't each hand-roll it.

export const DEFAULT_TIMEOUT_MS = 10_000

// fetch() with a hard timeout (aborts the request after timeoutMs). Throws on
// network error or abort — callers decide how to handle (throw vs fallback).
export async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// fetch + parse JSON, returning `fallback` on ANY failure (timeout, abort,
// non-2xx, or invalid JSON). The right primitive for best-effort data sources
// that must never break the pipeline.
export async function fetchJsonSafe<T>(
  url: string,
  opts: RequestInit = {},
  fallback: T,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  try {
    const res = await fetchWithTimeout(url, opts, timeoutMs)
    if (!res.ok) return fallback
    return (await res.json()) as T
  } catch {
    return fallback
  }
}
