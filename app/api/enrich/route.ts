export const maxDuration = 60

import { searchPeople, enrichCompany, formatApolloContact } from '@/lib/apollo'
import { searchContacts as ziSearchContacts } from '@/lib/zoominfo'

export async function POST(request: Request) {
  const body = await request.json()
  const { companyName, domain } = body

  const contacts: ReturnType<typeof formatApolloContact>[] = []

  // Try Apollo first
  try {
    const people = await searchPeople({
      companyName,
      domain: domain?.replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0],
      titles: ['CEO', 'CFO', 'COO', 'CTO', 'President', 'VP Real Estate', 'Head of Facilities', 'Chief of Staff'],
      limit: 8,
    })
    contacts.push(...people.map(formatApolloContact))
  } catch {
    // Apollo not configured or failed
  }

  // Try ZoomInfo as fallback/supplement
  if (contacts.length < 3) {
    try {
      const ziContacts = await ziSearchContacts({
        companyName,
        managementLevel: ['C-Level', 'VP-Level'],
      })
      for (const zc of ziContacts) {
        if (!contacts.find((c) => c.email === zc.email)) {
          contacts.push({
            first_name: zc.firstName,
            last_name: zc.lastName,
            title: zc.jobTitle,
            email: zc.email,
            phone: zc.phone,
            linkedin_url: zc.linkedInUrl,
            apollo_id: undefined!,
            is_c_suite: ['C-Level'].includes(zc.managementLevel),
            source: 'zoominfo',
          })
        }
      }
    } catch {
      // ZoomInfo not configured
    }
  }

  return Response.json({ contacts })
}
