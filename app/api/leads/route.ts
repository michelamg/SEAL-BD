import { generateLeads } from '@/lib/openai'

export const maxDuration = 60 // Vercel max for Pro plan

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { industry, location, companySize, triggerSignals, count, vertical } = body

    if (!industry) {
      return Response.json({ error: 'Industry is required' }, { status: 400 })
    }

    const leads = await generateLeads({ industry, location, companySize, triggerSignals, count, vertical })

    return Response.json({ leads })
  } catch (err) {
    console.error('Lead finder error:', err)
    return Response.json({ error: String(err), leads: [] }, { status: 500 })
  }
}
