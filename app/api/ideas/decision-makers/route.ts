import { openai } from '@/lib/openai'
import { searchPeople, formatApolloContact } from '@/lib/apollo'
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

    // If Apollo returned nothing, use AI to identify likely decision makers
    if (contacts.length === 0) {
      const prompt = `For ${companyName} (${industry || 'company'} in ${location || 'San Diego, CA'}), identify the 5 most likely real estate decision makers by title.

These are the people who influence or approve commercial real estate decisions (office, lab, industrial space).

Return JSON array: [{
  "first_name": "...",
  "last_name": "...",
  "title": "specific title",
  "is_c_suite": true/false,
  "note": "why this person is relevant to RE decisions"
}]

Use realistic titles specific to this type of company. Focus on: CFO, VP Real Estate, Head of Facilities, COO, Chief of Staff, Director of Corporate Services.`

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.5,
      })

      const data = JSON.parse(response.choices[0].message.content || '{"contacts":[]}')
      const aiContacts = data.contacts || data
      contacts = aiContacts.map((c: Record<string, unknown>) => ({
        first_name: String(c.first_name || ''),
        last_name: String(c.last_name || ''),
        title: String(c.title || ''),
        is_c_suite: Boolean(c.is_c_suite),
        source: 'ai',
        notes: String(c.note || ''),
        email: '',
        phone: '',
        linkedin_url: '',
        apollo_id: '',
      }))
    }

    return Response.json({ contacts })
  } catch (err) {
    captureError(err, { route: 'ideas-decision-makers' })
    return Errors.internal()
  }
}
