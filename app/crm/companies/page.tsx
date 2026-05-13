'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Company } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CompanyDialog } from '@/components/crm/company-dialog'
import { Plus, Search, ExternalLink } from 'lucide-react'

const STAGE_COLOR: Record<string, string> = {
  prospect: 'bg-gray-100 text-gray-700',
  qualifying: 'bg-yellow-100 text-yellow-700',
  active: 'bg-blue-100 text-blue-700',
  nurturing: 'bg-purple-100 text-purple-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
  disqualified: 'bg-gray-100 text-gray-500',
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [verticalFilter, setVerticalFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [trackFilter, setTrackFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selected, setSelected] = useState<Company | null>(null)

  const fetchCompanies = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('companies').select('*').order('updated_at', { ascending: false })
    if (verticalFilter !== 'all') q = q.eq('vertical', verticalFilter)
    if (stageFilter !== 'all') q = q.eq('stage', stageFilter)
    if (trackFilter !== 'all') q = q.eq('track', trackFilter)
    if (search) q = q.ilike('name', `%${search}%`)
    const { data } = await q
    setCompanies(data || [])
    setLoading(false)
  }, [search, verticalFilter, stageFilter, trackFilter])

  useEffect(() => { fetchCompanies() }, [fetchCompanies])

  const openNew = () => { setSelected(null); setDialogOpen(true) }
  const openEdit = (c: Company) => { setSelected(c); setDialogOpen(true) }

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-muted-foreground text-sm mt-1">{companies.length} records</p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> Add Company
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search companies…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 w-56 h-9"
          />
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vertical</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Stage</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Track</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Priority</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Trigger</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">SF Need</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {companies.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => openEdit(c)}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{c.name}</p>
                          {c.location && <p className="text-xs text-muted-foreground">{c.location}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {c.vertical && <Badge variant="outline" className="text-xs">{c.vertical}</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${STAGE_COLOR[c.stage] || ''}`}>
                          {c.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">Track {c.track}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[c.priority] || 'bg-gray-400'}`} />
                          <span className="capitalize text-xs">{c.priority}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-xs text-muted-foreground truncate">{c.trigger_signal || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {c.estimated_sf ? `${c.estimated_sf.toLocaleString()} SF` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {c.website && (
                          <a
                            href={c.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground"
                          >
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

      <CompanyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        company={selected}
        onSaved={fetchCompanies}
      />
    </div>
  )
}
