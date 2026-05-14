'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import type { LeadFinderResult } from '@/types'
import { Sparkles, Plus, ExternalLink, Loader2 } from 'lucide-react'

const TRIGGER_SIGNALS = [
  { id: 'recent_funding', label: 'Recent Funding' },
  { id: 'lease_expiration', label: 'Lease Expiration' },
  { id: 'headcount_growth', label: 'Headcount Growth' },
  { id: 'csuite_hiring', label: 'C-Suite Hiring' },
  { id: 'expansion', label: 'Expansion Announcement' },
  { id: 'gov_contract', label: 'Gov Contract Win' },
  { id: 'ma', label: 'M&A Activity' },
]

const PRIORITY_COLOR: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-700 border-red-200',
  MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  LOW: 'bg-gray-100 text-gray-600 border-gray-200',
}

export default function LeadsPage() {
  const [industry, setIndustry] = useState('')
  const [location, setLocation] = useState('San Diego, CA')
  const [size, setSize] = useState('51-200')
  const [count, setCount] = useState('8')
  const [triggers, setTriggers] = useState<string[]>(['recent_funding', 'headcount_growth'])
  const [vertical, setVertical] = useState('')
  const [results, setResults] = useState<LeadFinderResult[]>([])
  const [loading, setLoading] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [imported, setImported] = useState<Set<string>>(new Set())

  const toggleTrigger = (id: string) => {
    setTriggers((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id])
  }

  const [error, setError] = useState<string | null>(null)

  const search = async () => {
    if (!industry) return
    setLoading(true)
    setResults([])
    setError(null)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry, location, companySize: size, triggerSignals: triggers, count: parseInt(count), vertical }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResults(data.leads || [])
      if ((data.leads || []).length === 0) setError('No leads returned. Try a different industry or location.')
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const importLead = async (lead: LeadFinderResult) => {
    const key = lead.company_name
    setImportingId(key)
    try {
      const { data: existing } = await supabase.from('companies').select('id').ilike('name', lead.company_name).single()
      if (!existing) {
        await supabase.from('companies').insert({
          name: lead.company_name,
          website: lead.website,
          industry: lead.industry,
          vertical: lead.vertical_fit,
          location: lead.location,
          size: lead.employee_count,
          estimated_sf: lead.estimated_sf,
          priority: lead.priority.toLowerCase(),
          trigger_signal: `${lead.trigger_signal}: ${lead.trigger_detail}`,
          track: 'A',
          stage: 'prospect',
          source: lead.source,
        })
      }
      setImported((prev) => new Set([...prev, key]))
    } finally {
      setImportingId(null)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Lead Finder</h1>
        <p className="text-muted-foreground text-sm mt-1">Track A — Find and qualify new client prospects</p>
      </div>

      {/* Search Form */}
      <Card>
        <CardHeader><CardTitle className="text-base">Search Parameters</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label>Industry *</Label>
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Biotech, Defense…" />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, State" />
            </div>
            <div>
              <Label>Company Size</Label>
              <Select value={size} onValueChange={(v) => v != null && setSize(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['1-10','11-50','51-200','201-500','501-1000','1000+'].map(s => (
                    <SelectItem key={s} value={s}>{s} employees</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CRE Vertical</Label>
              <Select value={vertical} onValueChange={(v) => v != null && setVertical(v)}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  {['NIC','Tech','Life Sci','Defense','Pro Services'].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Trigger Signals</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {TRIGGER_SIGNALS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggleTrigger(t.id)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    triggers.includes(t.id)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label>Results</Label>
              <Select value={count} onValueChange={(v) => v != null && setCount(v)}>
                <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="8">8</SelectItem>
                  <SelectItem value="12">12</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={search} disabled={loading || !industry} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? 'Finding leads…' : 'Find Leads'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && !loading && (
        <div className="flex items-start gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
          <span className="font-medium">Error:</span> {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{results.length} leads found</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => results.forEach(importLead)}
            >
              Import All to CRM
            </Button>
          </div>

          <div className="grid gap-4">
            {results.map((lead) => {
              const isImported = imported.has(lead.company_name)
              const isImporting = importingId === lead.company_name
              return (
                <Card key={lead.company_name} className={isImported ? 'opacity-60' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{lead.company_name}</h3>
                          {lead.website && (
                            <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-muted-foreground">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${PRIORITY_COLOR[lead.priority]}`}>
                            {lead.priority}
                          </span>
                          <Badge variant="outline" className="text-xs">{lead.vertical_fit}</Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Trigger</p>
                            <p className="text-sm font-medium mt-0.5">{lead.trigger_signal}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{lead.trigger_detail}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Profile</p>
                            <p className="text-xs mt-0.5">{lead.location} · {lead.employee_count}</p>
                            {lead.estimated_sf && <p className="text-xs text-muted-foreground">~{lead.estimated_sf.toLocaleString()} SF need</p>}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Outreach Angle</p>
                            <p className="text-xs mt-0.5">{lead.outreach_recommendation}</p>
                          </div>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant={isImported ? 'outline' : 'default'}
                        className="shrink-0 gap-1"
                        onClick={() => importLead(lead)}
                        disabled={isImported || isImporting}
                      >
                        {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        {isImported ? 'Added' : 'Add to CRM'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Searching Apollo, ZoomInfo, and news signals…</p>
          </div>
        </div>
      )}
    </div>
  )
}
