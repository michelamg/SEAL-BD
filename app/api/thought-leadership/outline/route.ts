import { generateWhitePaperOutline } from '@/lib/openai'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await generateWhitePaperOutline(body)
    return Response.json(result)
  } catch (err) {
    console.error('Outline error:', err)
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
