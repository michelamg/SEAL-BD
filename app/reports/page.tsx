'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Download } from 'lucide-react'

const COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#6b7280']

export default function ReportsPage() {
  const [listing, setListing] = useState<string>('all')
  const [listings, setListings] = useState<{ id: string; name: string }[]>([])
  const [stats, setStats] = useState<{
    companiesByVertical: { name: string; value: number }[]
    companiesByStage: { name: string; value: number }[]
    outreachByType: { name: string; value: number }[]
    outreachByStatus: { name: string; value: number }[]
    listingProspects: { name: string; value: number }[]
    totalCompanies: number
    totalContacts: number
    totalOutreach: number
    wonDeals: number
  }>({
    companiesByVertical: [], companiesByStage: [], outreachByType: [],
    outreachByStatus: [], listingProspects: [], totalCompanies: 0,
    totalContacts: 0, totalOutreach: 0, wonDeals: 0,
  })

  useEffect(() => {
    supabase.from('listings').select('id, name').then(({ data }) => setListings(data || []))
  }, [])

  useEffect(() => {
    const load = async () => {
      const [
        { data: companies },
        { count: totalContacts },
        { data: outreach },
        { count: wonDeals },
        { data: prospects },
      ] = await Promise.all([
        supabase.from('companies').select('vertical, stage'),
        supabase.from('contacts').select('*', { count: 'exact', head: true }),
        supabase.from('outreach_activities').select('type, status'),
        supabase.from('deals').select('*', { count: 'exact', head: true }),
        listing !== 'all'
          ? supabase.from('listing_prospects').select('status').eq('listing_id', listing)
          : supabase.from('listing_prospects').select('status'),
      ])

      const tally = (arr: ({ [key: string]: string | null | undefined })[], key: string) => {
        const m: Record<string, number> = {}
        ;(arr || []).forEach((r) => { if (r[key]) m[r[key]!] = (m[r[key]!] || 0) + 1 })
        return Object.entries(m).map(([name, value]) => ({ name, value }))
      }

      setStats({
        companiesByVertical: tally(companies || [], 'vertical'),
        companiesByStage: tally(companies || [], 'stage'),
        outreachByType: tally(outreach || [], 'type'),
        outreachByStatus: tally(outreach || [], 'status'),
        listingProspects: tally(prospects || [], 'status'),
        totalCompanies: (companies || []).length,
        totalContacts: totalContacts || 0,
        totalOutreach: (outreach || []).length,
        wonDeals: wonDeals || 0,
      })
    }
    load()
  }, [listing])

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Pipeline analytics and marketing performance</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="w-4 h-4" /> Export PDF
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Companies', value: stats.totalCompanies },
          { label: 'Total Contacts', value: stats.totalContacts },
          { label: 'Total Outreach', value: stats.totalOutreach },
          { label: 'Deals Won', value: stats.wonDeals },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Companies by Vertical</CardTitle></CardHeader>
          <CardContent>
            {stats.companiesByVertical.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
              : <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stats.companiesByVertical} margin={{ left: -20 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[4,4,0,0]}>
                      {stats.companiesByVertical.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Pipeline Stages</CardTitle></CardHeader>
          <CardContent>
            {stats.companiesByStage.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
              : <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={stats.companiesByStage} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                      {stats.companiesByStage.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Outreach by Type</CardTitle></CardHeader>
          <CardContent>
            {stats.outreachByType.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
              : <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stats.outreachByType} margin={{ left: -20 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#2563eb" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Listing Prospects by Status</CardTitle>
              <Select value={listing} onValueChange={(v) => v != null && setListing(v)}>
                <SelectTrigger className="w-40 h-7 text-xs"><SelectValue placeholder="All listings" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All listings</SelectItem>
                  {listings.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {stats.listingProspects.length === 0
              ? <p className="text-sm text-muted-foreground text-center py-8">No prospect data yet</p>
              : <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stats.listingProspects} margin={{ left: -20 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#9333ea" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
            }
          </CardContent>
        </Card>
      </div>

      {/* Outreach status breakdown */}
      {stats.outreachByStatus.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Outreach Response Rate</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {stats.outreachByStatus.map((s, i) => (
                <div key={s.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-sm capitalize">{s.name.replace('_', ' ')}: <strong>{s.value}</strong></span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
