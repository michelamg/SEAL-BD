'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Listing, ListingProspect } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Search, Plus, Loader2 } from 'lucide-react'

const STATUS_COLOR: Record<string, string> = {
  identified: 'bg-gray-100 text-gray-700',
  contacted: 'bg-blue-100 text-blue-700',
  touring: 'bg-purple-100 text-purple-700',
  negotiating: 'bg-orange-100 text-orange-700',
  closed: 'bg-green-100 text-green-700',
  dead: 'bg-red-100 text-red-500',
}

export function ProspectPanel({ listing }: { listing: Listing }) {
  const [prospects, setProspects] = useState<(ListingProspect & { companies: { name: string; vertical?: string; location?: string } | null })[]>([])
  const [discovering, setDiscovering] = useState(false)

  const fetchProspects = async () => {
    const { data } = await supabase
      .from('listing_prospects')
      .select('*, companies(name, vertical, location)')
      .eq('listing_id', listing.id)
      .order('created_at', { ascending: false })
    setProspects(data || [])
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchProspects() }, [listing.id])

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('listing_prospects').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    fetchProspects()
  }

  const discoverProspects = async () => {
    setDiscovering(true)
    try {
      const res = await fetch('/api/listings/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id,
          listingName: listing.name,
          location: `${listing.city}, ${listing.state}`,
          verticals: listing.target_verticals,
          sizeSf: listing.size_sf,
        }),
      })
      const { prospects: found } = await res.json()
      if (found?.length) {
        for (const p of found) {
          const { data: existing } = await supabase.from('companies').select('id').ilike('name', p.company_name).single()
          let companyId = existing?.id
          if (!companyId) {
            const { data: newCo } = await supabase.from('companies').insert({
              name: p.company_name,
              website: p.website,
              industry: p.industry,
              vertical: p.vertical,
              location: p.location,
              track: 'B',
              stage: 'prospect',
              estimated_sf: p.estimated_sf,
              trigger_signal: p.reason,
              source: 'discovery',
            }).select('id').single()
            companyId = newCo?.id
          }
          if (companyId) {
            await supabase.from('listing_prospects').upsert({
              listing_id: listing.id,
              company_id: companyId,
              status: 'identified',
              interest_signals: p.reason,
              sf_needed: p.estimated_sf,
            }, { onConflict: 'listing_id,company_id' })
          }
        }
        fetchProspects()
      }
    } finally {
      setDiscovering(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{prospects.length} interested parties</p>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={discoverProspects} disabled={discovering}>
          {discovering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          {discovering ? 'Discovering…' : 'Discover via AI'}
        </Button>
      </div>

      {prospects.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No interested parties yet. Click &quot;Discover via AI&quot; to find tenants in market.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {prospects.map((p) => (
            <li key={p.id} className="py-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{p.companies?.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {p.companies?.vertical && <Badge variant="outline" className="text-[10px]">{p.companies.vertical}</Badge>}
                  {p.companies?.location && <span className="text-xs text-muted-foreground">{p.companies.location}</span>}
                </div>
                {p.interest_signals && <p className="text-xs text-muted-foreground mt-1">{p.interest_signals}</p>}
                {p.sf_needed && <p className="text-xs text-muted-foreground">{p.sf_needed.toLocaleString()} SF need</p>}
              </div>
              <Select value={p.status} onValueChange={(v) => v != null && updateStatus(p.id, v)}>
                <SelectTrigger className="w-36 h-7 text-xs">
                  <SelectValue>
                    <span className={`px-1.5 py-0.5 rounded text-xs capitalize ${STATUS_COLOR[p.status]}`}>{p.status}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(STATUS_COLOR).map(s => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
