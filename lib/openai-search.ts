import { openai, isOpenAIConfigured } from '@/lib/openai'

// OpenAI web search as a lead source. The model searches the live web for
// companies with real-estate signals (funding, expansion, hiring, relocation,
// layoffs) and must cite a page for each one.
//
// Trust rule (CONTEXT.md D3/D4): we keep only companies whose source link is one
// OpenAI actually retrieved during the search. A link the model wrote without
// visiting is dropped, so nothing invented reaches the pipeline.

export { isOpenAIConfigured as isOpenAISearchConfigured }

export interface WebFoundCompany {
  name: string
  website?: string
  location?: string
  signal: string
  source_url: string
  source_title?: string
}

const SEARCH_MODEL = process.env.OPENAI_SEARCH_MODEL || 'gpt-4o'

// Compare links loosely: ignore protocol, "www.", query strings, and trailing slashes.
export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u)
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    const path = url.pathname.replace(/\/+$/, '').toLowerCase()
    return host + path
  } catch {
    return ''
  }
}

// Pull every link OpenAI really used: url_citation annotations on the answer,
// plus the sources list on each web_search_call.
export function collectRetrievedUrls(output: unknown): Set<string> {
  const urls = new Set<string>()
  const add = (u: unknown) => {
    if (typeof u === 'string') {
      const n = normalizeUrl(u)
      if (n) urls.add(n)
    }
  }
  if (!Array.isArray(output)) return urls
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const it = item as Record<string, unknown>
    if (it.type === 'web_search_call') {
      const action = it.action as Record<string, unknown> | undefined
      if (action) {
        add(action.url)
        if (Array.isArray(action.sources)) {
          for (const s of action.sources) add((s as Record<string, unknown>)?.url)
        }
      }
    }
    if (it.type === 'message' && Array.isArray(it.content)) {
      for (const c of it.content) {
        const anns = (c as Record<string, unknown>)?.annotations
        if (!Array.isArray(anns)) continue
        for (const a of anns) {
          const ann = a as Record<string, unknown>
          if (ann?.type === 'url_citation') add(ann.url)
        }
      }
    }
  }
  return urls
}

// Read the JSON the model returned, tolerating ```json fences or stray prose.
export function parseCompanies(text: string): WebFoundCompany[] {
  const t = text.replace(/```json|```/g, '')
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  try {
    const data = JSON.parse(t.slice(start, end + 1)) as { companies?: unknown }
    if (!Array.isArray(data.companies)) return []
    return data.companies
      .map((c) => c as Record<string, unknown>)
      .filter((c) => typeof c.name === 'string' && typeof c.source_url === 'string' && /^https?:\/\//.test(c.source_url as string))
      .map((c) => ({
        name: String(c.name).trim(),
        website: typeof c.website === 'string' ? c.website : undefined,
        location: typeof c.location === 'string' ? c.location : undefined,
        signal: typeof c.signal === 'string' ? c.signal : '',
        source_url: String(c.source_url),
        source_title: typeof c.source_title === 'string' ? c.source_title : undefined,
      }))
  } catch {
    return []
  }
}

export async function searchCompaniesOnWeb({
  industry,
  location,
  companySize,
  triggerSignals,
  count = 10,
}: {
  industry: string
  location?: string
  companySize?: string
  triggerSignals?: string[]
  count?: number
}): Promise<{ companies: WebFoundCompany[]; dropped: number }> {
  const year = new Date().getFullYear()
  const signals = triggerSignals && triggerSignals.length
    ? triggerSignals.join(', ').replace(/_/g, ' ')
    : 'recent funding, expansion or new facility, headcount growth, relocation, lease activity, layoffs or consolidation, acquisitions, government contract wins'

  const input = `Search the web for up to ${count} real ${industry} companies${location ? ` located in or expanding into ${location}` : ''}${companySize ? ` with roughly ${companySize} employees` : ''} that show signals they may need to expand, consolidate, or relocate office, lab, or industrial space.

Signals to look for: ${signals}. Prefer news from ${year - 1} and ${year}.

Rules:
- Only include a company if you found a specific web page (news article, press release, filing, or company page) that mentions it and the signal. Put that exact page link in source_url.
- Never guess or invent companies, links, or facts. If you find fewer companies, return fewer.

Reply with ONLY a JSON object, no other text:
{"companies":[{"name":"","website":"","location":"city, state","signal":"one sentence on the signal, with its date","source_url":"https://...","source_title":""}]}`

  const params = {
    model: SEARCH_MODEL,
    tools: [{ type: 'web_search' }],
    include: ['web_search_call.action.sources'],
    input,
  }

  const response = await openai.responses.create(
    params as unknown as Parameters<typeof openai.responses.create>[0],
    { timeout: 40_000 },
  )

  const res = response as unknown as { output_text?: string; output?: unknown }
  const companies = parseCompanies(res.output_text || '')
  const retrieved = collectRetrievedUrls(res.output)

  // Keep only companies whose source link OpenAI actually retrieved.
  const verified = companies.filter((c) => retrieved.has(normalizeUrl(c.source_url)))
  return { companies: verified, dropped: companies.length - verified.length }
}
