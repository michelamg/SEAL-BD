import { generateLeads } from '@/lib/openai'
import { searchOrganizations, searchPeople, formatApolloContact } from '@/lib/apollo'

export async function POST(request: Request) {
  const body = await request.json()
  const { industry, location, companySize, triggerSignals, count, vertical } = body

  // Generate leads via OpenAI
  const leads = await generateLeads({ industry, location, companySize, triggerSignals, count, vertical })

  // Optionally enrich top leads with Apollo data
  const enriched = await Promise.all(
    (leads as Record<string, unknown>[]).slice(0, 3).map(async (lead) => {
      try {
        const people = await searchPeople({
          companyName: lead.company_name as string,
          titles: ['CEO', 'CFO', 'COO', 'President', 'VP Real Estate', 'Head of Facilities'],
          limit: 3,
        })
        return { ...lead, apollo_contacts: people.map(formatApolloContact) }
      } catch {
        return lead
      }
    })
  )

  const remaining = (leads as Record<string, unknown>[]).slice(3)

  return Response.json({ leads: [...enriched, ...remaining] })
}
