import { openai } from '@/lib/openai'
import { searchPeople, formatApolloContact } from '@/lib/apollo'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const { companyName, industry, location } = await request.json()

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
    console.error('Decision makers error:', err)
    return Response.json({ error: String(err), contacts: [] }, { status: 500 })
  }
}
