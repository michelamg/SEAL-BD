export const maxDuration = 60

import { generateOutreachEmail } from '@/lib/openai'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

  let body
  try {
    body = await request.json()
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const result = await generateOutreachEmail(body)
    return Response.json(result)
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Request failed' }, { status: 500 })
  }
}
