const SERP_API_KEY = process.env.SERP_API_KEY

interface SerpResult {
  title: string
  link: string
  snippet: string
  displayed_link?: string
}

export async function googleSearch(query: string): Promise<SerpResult[]> {
  if (!SERP_API_KEY) return []
  try {
    const params = new URLSearchParams({
      api_key: SERP_API_KEY,
      q: query,
      num: '10',
      engine: 'google',
    })
    const res = await fetch(`https://serpapi.com/search?${params}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.organic_results || []
  } catch {
    return []
  }
}

// Extract company names from search results using domain/title heuristics
export function extractCompaniesFromSearch(results: SerpResult[]): string[] {
  const companies: string[] = []
  for (const r of results) {
    // Get domain as company hint
    const domain = r.displayed_link?.split('/')[0]?.replace('www.', '') || ''
    // Use title — often "Company Name | ..."
    const titleParts = r.title.split(/[|\-–]/)[0].trim()
    if (titleParts.length > 2 && titleParts.length < 80) {
      companies.push(titleParts)
    }
  }
  return [...new Set(companies)]
}
