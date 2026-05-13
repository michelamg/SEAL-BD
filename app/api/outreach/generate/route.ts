import { generateOutreachEmail } from '@/lib/openai'

export async function POST(request: Request) {
  const body = await request.json()
  const result = await generateOutreachEmail(body)
  return Response.json(result)
}
