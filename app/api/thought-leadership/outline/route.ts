export const maxDuration = 60

import { generateWhitePaperOutline, isOpenAIConfigured } from '@/lib/openai'
import { z } from 'zod'
import { requireUser } from '@/lib/api/auth'
import { rateLimit } from '@/lib/api/rate-limit'
import { parseJson } from '@/lib/api/validate'
import { Errors } from '@/lib/api/responses'
import { captureError } from '@/lib/logger'

const Schema = z.object({
  vertical: z.string(),
  quarter: z.string(),
  marketTrends: z.string().optional(),
})

export async function POST(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user } = auth

  const rl = rateLimit(`tl-outline:${user.id}`, { limit: 20, windowMs: 60_000 })
  if (!rl.ok) return Errors.rateLimited(rl.retryAfterSec)

  const parsed = await parseJson(request, Schema)
  if ('error' in parsed) return parsed.error

  if (!isOpenAIConfigured()) return Errors.notConfigured('AI (OpenAI)')

  try {
    const result = await generateWhitePaperOutline(parsed.data)
    return Response.json(result)
  } catch (err) {
    captureError(err, { route: 'thought-leadership/outline' })
    return Errors.internal()
  }
}
