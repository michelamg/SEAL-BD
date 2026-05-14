import { openai } from '@/lib/openai'
import { searchOrganizations } from '@/lib/apollo'
import { searchCompanies as ziSearchCompanies } from '@/lib/zoominfo'
import { googleSearch, extractCompaniesFromSearch } from '@/lib/serp'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { industry, location, companySize, triggerSignals, count, vertical } = body

    if (!industry) {
      return Response.json({ error: 'Industry is required' }, { status: 400 })
    }

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
      errors.push(`Google: ${e}`)
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
      errors.push(`Apollo: ${e}`)
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
      errors.push(`ZoomInfo: ${e}`)
    }

    // ── 4. Deduplicate ────────────────────────────────────────────────────
    const seen = new Set<string>()
    const unique = foundCompanies.filter(c => {
      const key = c.name.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // ── 5. Use OpenAI to score + enrich what we found (or generate if no results) ──
    const prompt = unique.length > 0
      ? `You are a CRE analyst for Cushman & Wakefield. Score and enrich these REAL companies for commercial real estate outreach.

Companies found for ${industry} in ${location}:
${unique.slice(0, 20).map((c, i) => `${i + 1}. ${c.name}${c.description ? ` — ${c.description}` : ''}${c.location ? ` (${c.location})` : ''} [Source: ${c.source}]`).join('\n')}

Target: ${vertical || 'any'} vertical, company size: ${companySize}, trigger signals: ${triggerSignals?.join(', ')}

For each company, assess their CRE needs and return the top ${Math.min(count, unique.length)} most relevant ones.
Return JSON array: [{
  "company_name": "exact name from list",
  "website": "website if known",
  "industry": "specific industry",
  "location": "city, state",
  "employee_count": "estimated range",
  "estimated_sf": estimated_sq_footage_need,
  "priority": "HIGH|MEDIUM|LOW",
  "trigger_signal": "most relevant signal type",
  "trigger_detail": "specific reason this company needs CRE help now",
  "outreach_recommendation": "specific angle for outreach",
  "vertical_fit": "NIC|Tech|Life Sci|Defense|Pro Services|Other",
  "source": "source name"
}]`
      : `You are a CRE analyst for Cushman & Wakefield. Find ${count} REAL companies in ${industry} in ${location} that match: size ${companySize}, signals: ${triggerSignals?.join(', ')}.

Return JSON array: [{
  "company_name": "...",
  "website": "...",
  "industry": "...",
  "location": "...",
  "employee_count": "...",
  "estimated_sf": 0,
  "priority": "HIGH|MEDIUM|LOW",
  "trigger_signal": "...",
  "trigger_detail": "specific detail",
  "outreach_recommendation": "...",
  "vertical_fit": "NIC|Tech|Life Sci|Defense|Pro Services|Other",
  "source": "AI Research"
}]`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.6,
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
    console.error('Lead finder error:', err)
    return Response.json({ error: String(err), leads: [] }, { status: 500 })
  }
}
