export const maxDuration = 60

import { openai } from '@/lib/openai'

export async function POST(request: Request) {
  const body = await request.json()
  const { listingName, location, verticals, sizeSf } = body

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
}
