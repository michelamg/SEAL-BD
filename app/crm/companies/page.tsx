'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Company } from '@/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CompanyDialog } from '@/components/crm/company-dialog'
import { Plus, Search, ExternalLink, Download } from 'lucide-react'

type CompanyWithLease = Company & {
  property_name?: string
  address?: string
  owner_sublessor?: string
  date_leased?: string
  lease_term?: string
  leased_sf?: number
  base_rent?: string
  expiration_date?: string
  listing_agents?: string
  procuring_agents?: string
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-green-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<CompanyWithLease[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [verticalFilter, setVerticalFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [trackFilter, setTrackFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selected, setSelected] = useState<Company | null>(null)

  const fetchCompanies = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('companies').select('*, contacts(id)').order('name', { ascending: true })
    if (verticalFilter !== 'all') q = q.eq('vertical', verticalFilter)
    if (stageFilter !== 'all') q = q.eq('stage', stageFilter)
    if (trackFilter !== 'all') q = q.eq('track', trackFilter)
    if (search) q = q.ilike('name', `%${search}%`)
    const { data } = await q
    setCompanies(data || [])
    setLoading(false)
  }, [search, verticalFilter, stageFilter, trackFilter])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCompanies()
  }, [fetchCompanies])

  const openNew = () => { setSelected(null); setDialogOpen(true) }
  const openEdit = (c: CompanyWithLease) => { setSelected(c as Company); setDialogOpen(true) }

  const fmt = (v: unknown) => v ? String(v) : '—'
  const fmtDate = (v?: string) => v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'
  const fmtSF = (v?: number) => v ? v.toLocaleString() : '—'

  return (
    <div className="p-6 space-y-4 max-w-full mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-muted-foreground text-sm mt-1">{companies.length} records</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/export/salesforce?stage=active"
            download
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
          >
            <Download className="w-4 h-4" /> Export to Salesforce
          </a>
          <Button onClick={openNew} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" /> Add Company
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search companies…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-56 h-9" />
        </div>
        <Select value={trackFilter} onValueChange={(v) => v != null && setTrackFilter(v)}>
          <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Track" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tracks</SelectItem>
            <SelectItem value="A">Track A</SelectItem>
            <SelectItem value="B">Track B</SelectItem>
          </SelectContent>
        </Select>
        <Select value={verticalFilter} onValueChange={(v) => v != null && setVerticalFilter(v)}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Vertical" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Verticals</SelectItem>
            {['NIC', 'Tech', 'Life Sci', 'Defense', 'Pro Services', 'Other'].map(v => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stageFilter} onValueChange={(v) => v != null && setStageFilter(v)}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {['prospect', 'qualifying', 'active', 'nurturing', 'won', 'lost', 'disqualified'].map(s => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
          ) : companies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No companies found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border bg-muted/40 sticky top-0">
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Tenant / Company</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Contacts</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Property</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Address</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Owner / Sublessor</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Date Leased</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Term</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Leased SF</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Base Rent</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Expiration</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Listing Agents</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Procuring Agents</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Priority</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Notes</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {companies.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openEdit(c)}>
                      <td className="px-3 py-2.5">
                        <div>
                          <p className="font-medium">{c.name}</p>
                          {c.location && <p className="text-xs text-muted-foreground">{c.location}</p>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {((c as any).contacts?.length || 0) > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {(c as any).contacts.length} contact{(c as any).contacts.length !== 1 ? 's' : ''}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs">{fmt(c.property_name)}</td>
                      <td className="px-3 py-2.5 text-xs max-w-40"><p className="truncate">{fmt(c.address)}</p></td>
                      <td className="px-3 py-2.5 text-xs max-w-40"><p className="truncate">{fmt(c.owner_sublessor)}</p></td>
                      <td className="px-3 py-2.5 text-xs">{fmtDate(c.date_leased)}</td>
                      <td className="px-3 py-2.5 text-xs">{fmt(c.lease_term)}</td>
                      <td className="px-3 py-2.5 text-xs">{fmtSF(c.leased_sf)}</td>
                      <td className="px-3 py-2.5 text-xs">{fmt(c.base_rent)}</td>
                      <td className="px-3 py-2.5 text-xs">{fmtDate(c.expiration_date)}</td>
                      <td className="px-3 py-2.5 text-xs max-w-36"><p className="truncate">{fmt(c.listing_agents)}</p></td>
                      <td className="px-3 py-2.5 text-xs max-w-36"><p className="truncate">{fmt(c.procuring_agents)}</p></td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[c.priority] || 'bg-gray-400'}`} />
                          <span className="capitalize text-xs">{c.priority}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs max-w-48"><p className="truncate text-muted-foreground">{fmt(c.notes)}</p></td>
                      <td className="px-3 py-2.5">
                        {c.website && (
                          <a href={c.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-foreground">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CompanyDialog open={dialogOpen} onOpenChange={setDialogOpen} company={selected} onSaved={fetchCompanies} />
    </div>
  )
}
