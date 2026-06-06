import { generateWhitePaperOutline } from '@/lib/openai'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(request: Request) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const body = await request.json()
    const result = await generateWhitePaperOutline(body)
    return Response.json(result)
  } catch (err) {
    console.error('Outline error:', err)
    return Response.json({ error: 'Request failed' }, { status: 500 })
  }
}
