import { openai } from '@/lib/openai'
import { z } from 'zod'
import { requireUser } from '@/lib/api/auth'
import { rateLimit } from '@/lib/api/rate-limit'
import { parseJson } from '@/lib/api/validate'
import { Errors } from '@/lib/api/responses'
import { captureError } from '@/lib/logger'

export const maxDuration = 60

const GenerateSchema = z.object({
  prompt: z.string().min(1).max(4000),
})

export async function POST(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user } = auth

  const rl = rateLimit(`ideas-gen:${user.id}`, { limit: 20, windowMs: 60_000 })
  if (!rl.ok) return Errors.rateLimited(rl.retryAfterSec)

  const parsed = await parseJson(request, GenerateSchema)
  if ('error' in parsed) return parsed.error
  const { prompt } = parsed.data

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    })

    const raw = response.choices[0].message.content || '{}'
    const parsedResult = JSON.parse(raw)

    // If it's an email with subject+body, return formatted
    if (parsedResult.subject && parsedResult.body) {
      return Response.json({
        result: `Subject: ${parsedResult.subject}\n\n${parsedResult.body}`,
        subject: parsedResult.subject,
        body: parsedResult.body,
      })
    }

    return Response.json({ result: raw })
  } catch (err) {
    captureError(err, { route: 'ideas-generate' })
    return Errors.internal()
  }
}
