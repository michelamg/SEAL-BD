import { fetchWithTimeout } from '@/lib/http'

const APOLLO_API_KEY = process.env.APOLLO_API_KEY
const APOLLO_BASE = 'https://api.apollo.io/v1'

interface ApolloOrganization {
  id: string
  name: string
  website_url?: string
  industry?: string
  estimated_num_employees?: number
  city?: string
  state?: string
  country?: string
  short_description?: string
  founded_year?: number
  logo_url?: string
}

interface ApolloPerson {
  id: string
  first_name: string
  last_name: string
  title?: string
  email?: string
  phone_numbers?: { raw_number: string }[]
  linkedin_url?: string
  organization_id?: string
  organization?: ApolloOrganization
}

async function apolloFetch(endpoint: string, body: Record<string, unknown>) {
  if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY not configured')
  const res = await fetchWithTimeout(`${APOLLO_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': APOLLO_API_KEY,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Apollo API error: ${res.status}`)
  try {
    return await res.json()
  } catch {
    throw new Error(`Apollo API error: ${res.status}`)
  }
}

export async function searchOrganizations({
  name,
  domain,
}: {
  name?: string
  domain?: string
}) {
  const data = await apolloFetch('/organizations/search', {
    q_organization_name: name,
    q_organization_domains: domain ? [domain] : undefined,
    page: 1,
    per_page: 5,
  })
  return (data.organizations || []) as ApolloOrganization[]
}

export async function searchPeople({
  companyName,
  domain,
  titles,
  limit = 10,
}: {
  companyName?: string
  domain?: string
  titles?: string[]
  limit?: number
}) {
  const data = await apolloFetch('/mixed_people/search', {
    q_organization_name: companyName,
    q_organization_domains: domain ? [domain] : undefined,
    person_titles: titles || ['CEO', 'CFO', 'COO', 'CTO', 'President', 'VP Real Estate', 'Head of Facilities', 'Chief of Staff'],
    page: 1,
    per_page: limit,
  })
  return (data.people || []) as ApolloPerson[]
}

export async function enrichCompany(domain: string) {
  const data = await apolloFetch('/organizations/enrich', { domain })
  return data.organization as ApolloOrganization | null
}

export function formatApolloContact(person: ApolloPerson) {
  return {
    first_name: person.first_name,
    last_name: person.last_name,
    title: person.title || '',
    email: person.email || '',
    phone: person.phone_numbers?.[0]?.raw_number || '',
    linkedin_url: person.linkedin_url || '',
    apollo_id: person.id,
    is_c_suite: isCsuite(person.title || ''),
    source: 'apollo',
  }
}

function isCsuite(title: string): boolean {
  const t = title.toLowerCase()
  return ['ceo', 'cfo', 'coo', 'cto', 'cpo', 'president', 'chief', 'founder', 'partner', 'managing director'].some(
    (k) => t.includes(k)
  )
}
