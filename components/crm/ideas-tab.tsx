'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Company, Contact } from '@/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Loader2, Copy, CheckCircle, Users, Mail, FileText, ChevronRight } from 'lucide-react'

interface Idea {
  id: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  action: () => void
  result?: string
}

export function IdeasTab({ company }: { company: Company }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactsLoaded, setContactsLoaded] = useState(false)

  const copy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const saveAsOutreach = async (subject: string, body: string) => {
    await supabase.from('outreach_activities').insert({
      company_id: company.id,
      track: company.track || 'A',
      type: 'email',
      subject,
      body,
      status: 'draft',
      ai_generated: true,
    })
  }

  const runIdea = async (id: string, prompt: string) => {
    setLoading(id)
    try {
      const res = await fetch('/api/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId: id, company, prompt }),
      })
      const data = await res.json()
      setResults(prev => ({ ...prev, [id]: data.result }))
      // Auto-save email drafts to outreach
      if (data.subject && data.body) {
        await saveAsOutreach(data.subject, data.body)
      }
    } finally {
      setLoading(null)
    }
  }

  const findDecisionMakers = async () => {
    setLoading('decision-makers')
    try {
      const res = await fetch('/api/ideas/decision-makers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: company.name, industry: company.industry, location: company.location }),
      })
      const data = await res.json()
      if (data.contacts?.length) {
        // Save to contacts table
        await supabase.from('contacts').insert(
          data.contacts.map((c: Partial<Contact>) => ({ ...c, company_id: company.id, source: 'ai' }))
        )
        setContacts(data.contacts)
        setContactsLoaded(true)
        setResults(prev => ({ ...prev, 'decision-makers': `Found ${data.contacts.length} key decision makers and added to Contacts tab.` }))
      }
    } finally {
      setLoading(null)
    }
  }

  const IDEAS = [
    {
      id: 'cw-report',
      title: 'AI Report from CW',
      description: 'Generate a personalized Cushman & Wakefield market intelligence report for this prospect — market trends, comparable deals, space availability — ready to send as a first touch.',
      icon: FileText,
      badge: 'First Touch',
      prompt: `Generate a personalized CRE market intelligence email from Cushman & Wakefield for ${company.name}.
Company: ${company.name}
Industry: ${company.industry || 'unknown'}
Location: ${company.location || 'San Diego, CA'}
Trigger: ${company.trigger_signal || 'expansion opportunity'}

Write a concise, professional email that:
1. Opens with a relevant market insight for their industry in their market
2. References 1-2 recent comparable deals (realistic but illustrative)
3. Positions C&W as their strategic real estate advisor
4. Ends with a soft ask for a 15-min call
Keep it under 200 words. Make it feel like insider intel, not a sales pitch.
Return JSON: { "subject": "...", "body": "..." }`,
    },
    {
      id: 'lease-expiry-outreach',
      title: 'Lease Expiration Angle',
      description: "Draft an outreach email targeting the upcoming lease expiration as the hook — position C&W to help them evaluate options before it's too late.",
      icon: Mail,
      badge: 'High Convert',
      prompt: `Write a lease expiration outreach email from Cushman & Wakefield for ${company.name}.
Their lease expires: ${(company as Record<string, unknown>).expiration_date || 'soon'}
Location: ${company.location || 'San Diego, CA'}
Current space: ${(company as Record<string, unknown>).leased_sf || 'unknown'} SF

Write a professional, urgent-but-not-pushy email that:
1. Opens by noting the upcoming expiration timing
2. Explains why acting now (12-18 months out) gives them the most leverage
3. Offers a free market analysis / options assessment
4. Ends with a clear CTA
Under 150 words. Return JSON: { "subject": "...", "body": "..." }`,
    },
    {
      id: 'expansion-outreach',
      title: 'Growth / Expansion Pitch',
      description: 'AI drafts an outreach email using their growth signals (funding, headcount, expansion news) as the hook.',
      icon: ChevronRight,
      badge: 'Track A',
      prompt: `Write a growth-triggered outreach email from Cushman & Wakefield for ${company.name}.
Trigger signal: ${company.trigger_signal || 'recent growth'}
Industry: ${company.industry || 'unknown'}
Location: ${company.location || 'San Diego, CA'}

Write a professional email that:
1. References their specific growth signal naturally (not generic)
2. Connects growth to real estate needs (more space, better location, flexibility)
3. Positions C&W as having deep market knowledge for their sector
4. Soft CTA for a call or site tour
Under 150 words. Return JSON: { "subject": "...", "body": "..." }`,
    },
    {
      id: 'decision-makers',
      title: 'Find RE Decision Makers',
      description: 'AI identifies the key people at this company who influence real estate decisions — CFO, VP of Real Estate, Head of Facilities, Chief of Staff — and adds them to Contacts.',
      icon: Users,
      badge: 'AI Powered',
      isSpecial: true,
    },
  ]

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Outreach ideas and AI tools for <strong>{company.name}</strong></p>
      </div>

      <div className="space-y-3">
        {IDEAS.map((idea) => {
          const Icon = idea.icon
          const result = results[idea.id]
          const isLoading = loading === idea.id
          const isSpecial = (idea as Record<string, unknown>).isSpecial

          return (
            <div key={idea.id} className="border border-border rounded-lg overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{idea.title}</p>
                        {idea.badge && (
                          <Badge variant="outline" className="text-[10px]">{idea.badge}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{idea.description}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={result ? 'outline' : 'default'}
                    className="shrink-0 gap-1.5"
                    disabled={isLoading}
                    onClick={() => {
                      if (isSpecial) {
                        findDecisionMakers()
                      } else {
                        runIdea(idea.id, idea.prompt!)
                      }
                    }}
                  >
                    {isLoading
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Running…</>
                      : result
                        ? <><Sparkles className="w-3.5 h-3.5" />Regenerate</>
                        : <><Sparkles className="w-3.5 h-3.5" />Run</>
                    }
                  </Button>
                </div>
              </div>

              {/* Result */}
              {result && (
                <div className="border-t border-border bg-muted/30 p-4 space-y-3">
                  {isSpecial ? (
                    <p className="text-sm text-green-700 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />{result}
                    </p>
                  ) : (
                    <>
                      <Textarea value={result} readOnly rows={6} className="text-xs font-mono bg-background" />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copy(idea.id, result)}>
                          {copied === idea.id ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied === idea.id ? 'Copied!' : 'Copy'}
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={async () => {
                          try {
                            const parsed = JSON.parse(result)
                            if (parsed.subject && parsed.body) {
                              await saveAsOutreach(parsed.subject, parsed.body)
                              alert('Saved to Outreach tab as draft!')
                            }
                          } catch {
                            await saveAsOutreach(`Outreach — ${company.name}`, result)
                            alert('Saved to Outreach tab as draft!')
                          }
                        }}>
                          <Mail className="w-3.5 h-3.5" /> Save to Outreach
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
