import type { ZodType } from 'zod'
import { Errors } from './responses'

// Parse + validate a JSON request body against a Zod schema. Returns the typed
// data or a 400 Response. Catches malformed JSON and schema violations uniformly,
// so route handlers never hand unvalidated input to the DB or a paid API.
//
//   const parsed = await parseJson(request, MySchema)
//   if ('error' in parsed) return parsed.error
//   const { field } = parsed.data
export async function parseJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ data: T } | { error: Response }> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { error: Errors.badRequest('Invalid JSON body') }
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')
    return { error: Errors.badRequest(detail) }
  }
  return { data: result.data }
}
