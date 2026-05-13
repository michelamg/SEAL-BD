import { generateWhitePaperOutline } from '@/lib/openai'

export async function POST(request: Request) {
  const body = await request.json()
  const result = await generateWhitePaperOutline(body)
  return Response.json(result)
}
