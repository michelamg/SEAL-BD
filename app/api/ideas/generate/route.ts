import { openai } from '@/lib/openai'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json()

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    })

    const raw = response.choices[0].message.content || '{}'
    const parsed = JSON.parse(raw)

    // If it's an email with subject+body, return formatted
    if (parsed.subject && parsed.body) {
      return Response.json({
        result: `Subject: ${parsed.subject}\n\n${parsed.body}`,
        subject: parsed.subject,
        body: parsed.body,
      })
    }

    return Response.json({ result: raw })
  } catch (err) {
    console.error('Ideas generate error:', err)
    return Response.json({ error: String(err), result: '' }, { status: 500 })
  }
}
