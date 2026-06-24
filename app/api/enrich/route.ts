export const maxDuration = 60

import { searchPeople, formatApolloContact, isApolloConfigured } from '@/lib/apollo'
import { searchContacts as ziSearchContacts, isZoomInfoConfigured } from '@/lib/zoominfo'
import { z } from 'zod'
import { requireUser } from '@/lib/api/auth'
import { rateLimit } from '@/lib/api/rate-limit'
import { parseJson } from '@/lib/api/validate'
import { Errors } from '@/lib/api/responses'
import { captureError } from '@/lib/logger'

const EnrichSchema = z
  .object({
    companyName: z.string().optional(),
    domain: z.string().optional(),
  })
  .refine((d) => Boolean(d.companyName || d.domain), {
    message: 'companyName or domain is required',
  })

export async function POST(request: Request) {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { user } = auth

  const rl = rateLimit(`enrich:${user.id}`, { limit: 20, windowMs: 60_000 })
  if (!rl.ok) return Errors.rateLimited(rl.retryAfterSec)

  const parsed = await parseJson(request, EnrichSchema)
  if ('error' in parsed) return parsed.error
  const { companyName, domain } = parsed.data

  // Both enrichment providers are paid (C&W-funded). On the free tier neither is
  // configured — say so cleanly instead of returning an empty list as if it ran.
  if (!isApolloConfigured() && !isZoomInfoConfigured()) {
    return Errors.notConfigured('Contact enrichment (Apollo / ZoomInfo)')
  }

  try {
    const contacts: ReturnType<typeof formatApolloContact>[] = []

    // Try Apollo first
    try {
      const people = await searchPeople({
        companyName,
        domain: domain?.replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0],
        titles: ['CEO', 'CFO', 'COO', 'CTO', 'President', 'VP Real Estate', 'Head of Facilities', 'Chief of Staff'],
        limit: 8,
      })
      contacts.push(...people.map(formatApolloContact))
    } catch {
      // Apollo not configured or failed
    }

    // Try ZoomInfo as fallback/supplement
    if (contacts.length < 3) {
      try {
        const ziContacts = await ziSearchContacts({
          companyName,
          managementLevel: ['C-Level', 'VP-Level'],
        })
        for (const zc of ziContacts) {
          if (!contacts.find((c) => c.email === zc.email)) {
            contacts.push({
              first_name: zc.firstName,
              last_name: zc.lastName,
              title: zc.jobTitle,
              email: zc.email,
              phone: zc.phone,
              linkedin_url: zc.linkedInUrl,
              apollo_id: undefined!,
              is_c_suite: ['C-Level'].includes(zc.managementLevel),
              source: 'zoominfo',
            })
          }
        }
      } catch {
        // ZoomInfo not configured
      }
    }

    return Response.json({ contacts })
  } catch (err) {
    captureError(err, { route: 'enrich' })
    return Errors.internal()
  }
}
