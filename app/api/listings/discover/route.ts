export const maxDuration = 60

import { openai } from '@/lib/openai'
import { z } from 'zod'
import { requireUser } from '@/lib/api/auth'
import { rateLimit } from '@/lib/api/rate-limit'
import { parseJson } from '@/lib/api/validate'
import { Errors } from '@/lib/api/responses'
import { captureError } from '@/lib/logger'

const Schema = z.object({
  listingName: z.string().optional(),
  location: z.string().optional(),
  verticals: z.array(z.string()).optional(),
  sizeSf: z.number().optional(),
})

export async function POST(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user } = auth

  const rl = rateLimit(`listings-discover:${user.id}`, { limit: 20, windowMs: 60_000 })
  if (!rl.ok) return Errors.rateLimited(rl.retryAfterSec)

  const parsed = await parseJson(request, Schema)
  if ('error' in parsed) return parsed.error
  const { listingName, location, verticals, sizeSf } = parsed.data

  try {
    const prompt = `You are a commercial real estate analyst for Cushman & Wakefield.

Find 8 companies that are realistic prospects for this commercial property:
- Property: ${listingName}
- Location: ${location}
- Size: ${sizeSf ? `${sizeSf.toLocaleString()} SF` : 'varies'}
- Target verticals: ${verticals?.join(', ') || 'all'}

Identify companies that:
1. Are currently in market or likely expanding in ${location}
2. Match the target vertical(s)
3. Have a footprint need that fits this property

Return JSON array: [{
  "company_name": "...",
  "website": "...",
  "industry": "...",
  "vertical": "NIC|Tech|Life Sci|Defense|Pro Services|Other",
  "location": "current location",
  "estimated_sf": 0,
  "reason": "why this company is a fit and signal of need"
}]`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.8,
    })

    const data = JSON.parse(response.choices[0].message.content || '{"prospects":[]}')
    return Response.json({ prospects: data.prospects || data })
  } catch (err) {
    captureError(err, { route: 'listings/discover' })
    return Errors.internal()
  }
}
