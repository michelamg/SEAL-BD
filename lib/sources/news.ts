import { inferSignalType } from '@/lib/signals'
import type { LeadSource, RawSignal, SourceCompany } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// News source connector — funding / leadership / expansion press for PRIVATE
// companies that SEC EDGAR doesn't cover.
//
// Reuses the existing SerpAPI key (engine=google_news), so it's ~$0 incremental.
// Enabled only when SERP_API_KEY is present. News is unverified by nature, so
// signals carry confidence 'unverified' (they corroborate but don't, alone,
// reach the hot queue). Only recognizable signal types are kept — random news is
// dropped to avoid noise.
// ─────────────────────────────────────────────────────────────────────────────

const SERP_API_KEY = process.env.SERP_API_KEY
const NEWS_ENABLED = !!SERP_API_KEY

export interface NewsResult {
  title?: string
  date?: string
  link?: string
  source?: { name?: string } | string
}

// Keep only a usable date string (drop relative "2 days ago" etc.).
function parseDate(raw?: string): string | null {
  if (!raw) return null
  const t = Date.parse(raw)
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10)
}

// Pure: news results → normalized RawSignals. Drops anything that doesn't classify
// to a real signal type (returns 'other' → filtered out).
export function mapNewsResults(results: NewsResult[]): RawSignal[] {
  return results
    .map((r): RawSignal | null => {
      const type = inferSignalType(r.title)
      if (type === 'other') return null
      const srcName = typeof r.source === 'string' ? r.source : r.source?.name
      return {
        type,
        summary: r.title ?? 'News mention',
        observed_at: parseDate(r.date),
        source: srcName ? `News (${srcName})` : 'News',
        source_url: r.link,
        confidence: 'unverified',
      }
    })
    .filter((s): s is RawSignal => s !== null)
}

export const newsSource: LeadSource = {
  name: 'News',
  enabled: NEWS_ENABLED,
  async fetchSignals(company: SourceCompany): Promise<RawSignal[]> {
    if (!NEWS_ENABLED) return []
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const q = `"${company.name}" (funding OR raises OR expansion OR relocating OR "new CEO" OR "new CFO" OR hiring OR headquarters)`
      const url = `https://serpapi.com/search.json?engine=google_news&q=${encodeURIComponent(q)}&api_key=${SERP_API_KEY}`
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) return []
      const json = (await res.json()) as { news_results?: NewsResult[] }
      return mapNewsResults((json.news_results ?? []).slice(0, 10))
    } catch {
      return []
    } finally {
      clearTimeout(timeout)
    }
  },
}
