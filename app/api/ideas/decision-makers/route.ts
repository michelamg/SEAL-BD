import { openai, isOpenAIConfigured } from '@/lib/openai'
import { searchPeople, formatApolloContact, isApolloConfigured } from '@/lib/apollo'
import { z } from 'zod'
import { requireUser } from '@/lib/api/auth'
import { rateLimit } from '@/lib/api/rate-limit'
import { parseJson } from '@/lib/api/validate'
import { Errors } from '@/lib/api/responses'
import { captureError } from '@/lib/logger'

export const maxDuration = 60

const DecisionMakersSchema = z.object({
  companyName: z.string().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
})

export async function POST(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user } = auth

  const rl = rateLimit(`ideas-dm:${user.id}`, { limit: 20, windowMs: 60_000 })
  if (!rl.ok) return Errors.rateLimited(rl.retryAfterSec)

  const parsed = await parseJson(request, DecisionMakersSchema)
  if ('error' in parsed) return parsed.error
  const { companyName, industry, location } = parsed.data

  try {

    let contacts: ReturnType<typeof formatApolloContact>[] = []

    // Try Apollo first
    try {
      const people = await searchPeople({
        companyName,
        titles: [
          'CFO', 'Chief Financial Officer',
          'VP Real Estate', 'Vice President Real Estate',
          'Head of Facilities', 'Director of Facilities',
          'Chief of Staff', 'COO', 'Chief Operating Officer',
          'VP Operations', 'Director of Operations',
          'President', 'CEO', 'Founder',
          'VP Corporate Services', 'Director of Corporate Real Estate',
        ],
        limit: 8,
      })
      contacts = people.map(formatApolloContact)
    } catch {
      // Apollo not configured — fall back to AI
    }

    // If Apollo returned nothing and AI is available, suggest decision-maker
    // ROLES to target — never invent named people. Fabricating real-person PII
    // (names) for a real prospect violates the no-fabrication rule the rest of
    // the product enforces; titles + rationale are useful and honest.
    if (contacts.length === 0 && isOpenAIConfigured()) {
      const prompt = `For ${companyName || 'a company'} (${industry || 'company'} in ${location || 'San Diego, CA'}), list the 5 job titles/roles most likely to influence or approve commercial real estate decisions (office, lab, industrial space).

Do NOT invent specific people or names — return ROLES only.

Return JSON array: [{
  "title": "specific role/title",
  "is_c_suite": true/false,
  "note": "why this role drives RE decisions at this type of company"
}]

Focus on: CFO, VP Real Estate, Head of Facilities, COO, Chief of Staff, Director of Corporate Services.`

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.5,
      }, { timeout: 30000 })

      const data = JSON.parse(response.choices[0].message.content || '{"roles":[]}')
      const aiRoles = Array.isArray(data) ? data : data.roles || data.contacts || []
      contacts = (Array.isArray(aiRoles) ? aiRoles : []).map((c: Record<string, unknown>) => ({
        first_name: '', // role suggestion — no fabricated person
        last_name: '',
        title: String(c.title || ''),
        is_c_suite: Boolean(c.is_c_suite),
        source: 'ai-suggested-role',
        notes: String(c.note || ''),
        email: '',
        phone: '',
        linkedin_url: '',
        apollo_id: '',
      }))
    }

    return Response.json({ contacts, source: contacts[0]?.source === 'ai-suggested-role' ? 'ai-suggested-roles' : 'apollo' })
  } catch (err) {
    captureError(err, { route: 'ideas-decision-makers' })
    return Errors.internal()
  }
}
