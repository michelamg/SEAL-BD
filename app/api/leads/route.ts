import { openai } from '@/lib/openai'
import { searchOrganizations } from '@/lib/apollo'
import { searchCompanies as ziSearchCompanies } from '@/lib/zoominfo'
import { googleSearch, extractCompaniesFromSearch } from '@/lib/serp'
import { z } from 'zod'
import { requireUser } from '@/lib/api/auth'
import { rateLimit } from '@/lib/api/rate-limit'
import { parseJson } from '@/lib/api/validate'
import { Errors } from '@/lib/api/responses'
import { captureError } from '@/lib/logger'

export const maxDuration = 60

const LeadsSchema = z.object({
  industry: z.string().min(1),
  location: z.string().optional(),
  companySize: z.string().optional(),
  triggerSignals: z.array(z.string()).optional(),
  count: z.number().optional(),
  vertical: z.string().optional(),
})

export async function POST(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user } = auth

  const rl = rateLimit(`leads:${user.id}`, { limit: 20, windowMs: 60_000 })
  if (!rl.ok) return Errors.rateLimited(rl.retryAfterSec)

  const parsed = await parseJson(request, LeadsSchema)
  if ('error' in parsed) return parsed.error
  const { industry, location, companySize, triggerSignals, count, vertical } = parsed.data

  try {

    const foundCompanies: { name: string; website?: string; location?: string; source: string; description?: string }[] = []
    const errors: string[] = []

    // ── 1. Google Search (SerpAPI) ────────────────────────────────────────
    try {
      const queries = [
        `${industry} companies ${location} office space expansion 2024 2025`,
        `${industry} ${location} company growing hiring`,
        triggerSignals?.includes('recent_funding') ? `${industry} ${location} funding raised series` : null,
        triggerSignals?.includes('gov_contract') ? `${industry} ${location} government contract awarded` : null,
      ].filter(Boolean) as string[]

      for (const q of queries.slice(0, 2)) {
        const results = await googleSearch(q)
        const names = extractCompaniesFromSearch(results)
        names.forEach(name => foundCompanies.push({ name, source: 'Google Search' }))
      }
    } catch (e) {
      console.error(e)
      errors.push('Google Search')
    }

    // ── 2. Apollo.io ──────────────────────────────────────────────────────
    try {
      const apolloResults = await searchOrganizations({ name: industry })
      apolloResults.forEach(org => {
        if (org.name) foundCompanies.push({
          name: org.name,
          website: org.website_url || undefined,
          location: [org.city, org.state].filter(Boolean).join(', '),
          description: org.short_description || undefined,
          source: 'Apollo.io',
        })
      })
    } catch (e) {
      console.error(e)
      errors.push('Apollo')
    }

    // ── 3. ZoomInfo ───────────────────────────────────────────────────────
    try {
      const [city, state] = (location || '').split(',').map((s: string) => s.trim())
      const ziResults = await ziSearchCompanies({
        industryKeywords: [industry],
        city,
        state,
      })
      ziResults.forEach((co: { name?: string; website?: string; city?: string; state?: string; description?: string }) => {
        if (co.name) foundCompanies.push({
          name: co.name,
          website: co.website,
          location: [co.city, co.state].filter(Boolean).join(', '),
          description: co.description,
          source: 'ZoomInfo',
        })
      })
    } catch (e) {
      console.error(e)
      errors.push('ZoomInfo')
    }

    // ── 4. Deduplicate ────────────────────────────────────────────────────
    const seen = new Set<string>()
    const unique = foundCompanies.filter(c => {
      const key = c.name.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // ── 5. Score + enrich ONLY the REAL companies we found. Never fabricate. ──
    // Trust rule (CONTEXT.md D3/D4): if the live sources returned nothing, return nothing.
    // The model scores and narrates verified companies; it never invents them.
    if (unique.length === 0) {
      return Response.json({
        leads: [],
        sources_used: ['Google Search', 'Apollo.io', 'ZoomInfo'].filter(s =>
          foundCompanies.some(c => c.source === s)),
        raw_found: 0,
        message: 'No companies surfaced from the live sources for this search. Nothing was fabricated; try broadening the criteria or adding signals.',
        errors: errors.length > 0 ? errors : undefined,
      })
    }

    const prompt = `You are a CRE analyst for Cushman & Wakefield. Score and enrich these REAL companies for commercial real estate outreach. Use ONLY the companies in the list below. Do NOT invent companies and do NOT fabricate facts; assess based only on what is provided.

Companies found for ${industry} in ${location}:
${unique.slice(0, 20).map((c, i) => `${i + 1}. ${c.name}${c.description ? ` (${c.description})` : ''}${c.location ? ` [${c.location}]` : ''} [Source: ${c.source}]`).join('\n')}

Target: ${vertical || 'any'} vertical, company size: ${companySize}, trigger signals: ${triggerSignals?.join(', ')}

For each company, assess their CRE needs and return the top ${Math.min(count as number, unique.length)} most relevant ones.
Return JSON array: [{
  "company_name": "exact name from list",
  "website": "website if known",
  "industry": "specific industry",
  "location": "city, state",
  "employee_count": "estimated range",
  "estimated_sf": estimated_sq_footage_need,
  "priority": "HIGH|MEDIUM|LOW",
  "trigger_signal": "most relevant signal type",
  "trigger_detail": "specific reason this company needs CRE help now, based only on the provided data",
  "outreach_recommendation": "specific angle for outreach",
  "vertical_fit": "NIC|Tech|Life Sci|Defense|Pro Services|Other",
  "source": "source name"
}]`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const raw = response.choices[0].message.content || '{"leads":[]}'
    const aiData = JSON.parse(raw)

    // Handle any JSON structure OpenAI returns
    const leads = Array.isArray(aiData)
      ? aiData
      : aiData.leads || aiData.companies || aiData.results || aiData.data
        || Object.values(aiData).find(v => Array.isArray(v))
        || []

    return Response.json({
      leads,
      sources_used: [
        foundCompanies.some(c => c.source === 'Google Search') && 'Google Search',
        foundCompanies.some(c => c.source === 'Apollo.io') && 'Apollo.io',
        foundCompanies.some(c => c.source === 'ZoomInfo') && 'ZoomInfo',
        'OpenAI Analysis',
      ].filter(Boolean),
      raw_found: unique.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    captureError(err, { route: 'leads' })
    return Errors.internal()
  }
}
