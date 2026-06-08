import OpenAI from 'openai'

// Lazily constructed so the client is never built at module-load. `next build`
// evaluates route modules to collect page data; an eager `new OpenAI()` throws
// "Missing credentials" wherever OPENAI_API_KEY isn't set at build time (CI, or
// any build env without the key). The proxy keeps every `openai.chat...` call
// site unchanged while deferring construction to the first real call (which runs
// with the key present).
let client: OpenAI | undefined
function getClient(): OpenAI {
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return client
}

export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const c = getClient()
    const value = c[prop as keyof OpenAI]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(c) : value
  },
})

export const VERTICALS = ['NIC', 'Tech', 'Life Sci', 'Defense', 'Pro Services'] as const

export const OUTREACH_TEMPLATES = {
  NIC: {
    subject: 'Expanding in [City]? Strategic Space Options for [Company]',
    opening: 'Given [trigger_signal], we wanted to reach out about premier space solutions in [location] tailored for national industrial companies.',
  },
  Tech: {
    subject: '[Company]\'s Growth → Right-Sized Office Strategy',
    opening: 'Congratulations on [trigger_signal] — growth milestones like this often signal an opportunity to reassess your real estate footprint.',
  },
  'Life Sci': {
    subject: 'Lab + Office Solutions for [Company]\'s Next Phase',
    opening: 'With [trigger_signal], this is often the moment life science companies reconsider their space requirements to support R&D scale-up.',
  },
  Defense: {
    subject: 'Secure, Mission-Ready Facilities for [Company]',
    opening: 'Following [trigger_signal], we\'d like to share how we\'ve helped defense contractors find compliant, strategically-located facilities in [location].',
  },
  'Pro Services': {
    subject: 'Class A Office Strategy for [Company]',
    opening: 'As [trigger_signal] positions [Company] for growth, we\'d like to discuss how top professional services firms are optimizing their real estate footprint.',
  },
}

export async function generateOutreachEmail({
  companyName,
  vertical,
  triggerSignal,
  location,
  recipientName,
  recipientTitle,
  listingName,
}: {
  companyName: string
  vertical: string
  triggerSignal: string
  location: string
  recipientName?: string
  recipientTitle?: string
  listingName?: string
}) {
  const template = OUTREACH_TEMPLATES[vertical as keyof typeof OUTREACH_TEMPLATES] || OUTREACH_TEMPLATES['Tech']

  const prompt = `You are a senior commercial real estate broker at Cushman & Wakefield writing a personalized outreach email.

Company: ${companyName}
Vertical: ${vertical}
Trigger Signal: ${triggerSignal}
Location: ${location}
${recipientName ? `Recipient: ${recipientName}, ${recipientTitle}` : ''}
${listingName ? `Featured Listing: ${listingName}` : ''}

Write a concise, professional cold outreach email (under 150 words).
- Subject line should be compelling and specific
- Opening should reference the trigger signal naturally
- No generic language or obvious templates
- Close with a specific ask (15-min call, site tour, etc.)
- Tone: confident, peer-level, not salesy

Return JSON: { "subject": "...", "body": "..." }`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  }, { timeout: 30000 })

  const content = response.choices?.[0]?.message?.content
  try {
    return JSON.parse(content || '{}') as { subject: string; body: string }
  } catch (err) {
    console.error(err)
    return { subject: '', body: '' }
  }
}

export async function generateWhitePaperOutline({
  vertical,
  quarter,
  marketTrends,
}: {
  vertical: string
  quarter: string
  marketTrends?: string
}) {
  const prompt = `Create a quarterly thought leadership white paper outline for Cushman & Wakefield targeting the ${vertical} sector for ${quarter}.

${marketTrends ? `Current market context: ${marketTrends}` : ''}

Return JSON: {
  "title": "...",
  "executive_summary": "2-3 sentences",
  "sections": [{ "heading": "...", "key_points": ["..."] }],
  "call_to_action": "...",
  "target_audience": "..."
}`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  }, { timeout: 30000 })

  const content = response.choices?.[0]?.message?.content
  try {
    return JSON.parse(content || '{}')
  } catch (err) {
    console.error(err)
    return {}
  }
}
