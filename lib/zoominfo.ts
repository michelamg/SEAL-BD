const ZOOMINFO_CLIENT_ID = process.env.ZOOMINFO_CLIENT_ID
const ZOOMINFO_PRIVATE_KEY = process.env.ZOOMINFO_PRIVATE_KEY
const ZOOMINFO_BASE = 'https://api.zoominfo.com'

let ziToken: string | null = null
let ziTokenExpiry = 0
let ziTokenInFlight: Promise<string> | null = null

async function fetchZiToken(): Promise<string> {
  if (!ZOOMINFO_CLIENT_ID || !ZOOMINFO_PRIVATE_KEY) throw new Error('ZoomInfo credentials not configured')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(`${ZOOMINFO_BASE}/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: ZOOMINFO_CLIENT_ID, private_key: ZOOMINFO_PRIVATE_KEY }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`ZoomInfo auth failed: ${res.status}`)
    const data = await res.json()
    if (!data.jwt) throw new Error('ZoomInfo auth returned no jwt')
    ziToken = data.jwt
    ziTokenExpiry = Date.now() + 55 * 60 * 1000 // 55 min
    return ziToken!
  } finally {
    clearTimeout(timeout)
  }
}

async function getZiToken(): Promise<string> {
  if (ziToken && Date.now() < ziTokenExpiry) return ziToken
  // Single-flight: reuse an in-flight authenticate call instead of racing parallel ones.
  if (!ziTokenInFlight) {
    ziTokenInFlight = fetchZiToken().finally(() => {
      ziTokenInFlight = null
    })
  }
  return ziTokenInFlight
}

async function ziFetchOnce(endpoint: string, body: Record<string, unknown>): Promise<Response> {
  const token = await getZiToken()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    return await fetch(`${ZOOMINFO_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function ziFetch(endpoint: string, body: Record<string, unknown>) {
  let res = await ziFetchOnce(endpoint, body)
  if (res.status === 401) {
    // Token may be stale/invalid — clear cache and retry once with a fresh token.
    ziToken = null
    ziTokenExpiry = 0
    res = await ziFetchOnce(endpoint, body)
  }
  if (!res.ok) throw new Error(`ZoomInfo API error: ${res.status}`)
  return res.json()
}

export async function searchCompanies({
  name,
  city,
  state,
  industryKeywords,
  employeeCountMin,
  employeeCountMax,
}: {
  name?: string
  city?: string
  state?: string
  industryKeywords?: string[]
  employeeCountMin?: number
  employeeCountMax?: number
}) {
  const data = await ziFetch('/enrich/company/search', {
    outputFields: ['id', 'name', 'website', 'industry', 'employeeCount', 'city', 'state', 'description', 'revenue'],
    matchCompanyInput: [
      {
        name,
        city,
        state,
        industryKeywords,
        employeeCount: employeeCountMin || employeeCountMax
          ? { minValue: employeeCountMin, maxValue: employeeCountMax }
          : undefined,
      },
    ],
    rpp: 10,
    page: 1,
  })
  return data.data || []
}

export async function searchContacts({
  companyName,
  managementLevel,
  city,
  state,
}: {
  companyName?: string
  managementLevel?: string[]
  city?: string
  state?: string
}) {
  const data = await ziFetch('/enrich/contact/search', {
    outputFields: ['id', 'firstName', 'lastName', 'jobTitle', 'email', 'phone', 'linkedInUrl', 'companyName'],
    matchPersonInput: [
      {
        companyName,
        managementLevel: managementLevel || ['C-Level', 'VP-Level', 'Director'],
        city,
        state,
      },
    ],
    rpp: 10,
    page: 1,
  })
  return data.data || []
}
