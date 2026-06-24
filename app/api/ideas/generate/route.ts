import { openai, isOpenAIConfigured } from '@/lib/openai'
import { z } from 'zod'
import { requireUser } from '@/lib/api/auth'
import { rateLimit } from '@/lib/api/rate-limit'
import { parseJson } from '@/lib/api/validate'
import { Errors } from '@/lib/api/responses'
import { captureError } from '@/lib/logger'

// Scope the assistant to this product's domain so the route isn't a general-
// purpose LLM proxy on the C&W key (cost/abuse/jailbreak surface).
const SYSTEM_PROMPT =
  'You are a commercial real estate business-development assistant for Cushman & Wakefield. ' +
  'Only help with CRE prospecting, outreach, qualification, market research, and thought-leadership tasks. ' +
  'Decline anything outside that scope. Never fabricate companies, people, contact details, or facts. ' +
  'Respond as JSON.'

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

  if (!isOpenAIConfigured()) return Errors.notConfigured('AI (OpenAI)')

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }, { timeout: 30000 })

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
