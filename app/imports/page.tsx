'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { PitchbookReport, PitchbookCompany } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UploadCloud, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

export default function ImportsPage() {
  const [reports, setReports] = useState<PitchbookReport[]>([])
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [reportCompanies, setReportCompanies] = useState<PitchbookCompany[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ count: number } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const fetchReports = async () => {
    const { data } = await supabase.from('pitchbook_reports').select('*').order('created_at', { ascending: false })
    setReports(data || [])
  }

  useEffect(() => { fetchReports() }, [])

  useEffect(() => {
    if (selectedReport) {
      supabase.from('pitchbook_companies').select('*').eq('report_id', selectedReport).order('company_name')
        .then(({ data }) => setReportCompanies(data || []))
    }
  }, [selectedReport])

  const uploadPitchbook = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadResult(null)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/imports/pitchbook', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setUploadResult({ count: data.count })
      fetchReports()
    } catch (err) {
      setUploadError(String(err))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const uploadComps = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadResult(null)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/imports/comps', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setUploadResult({ count: data.count })
    } catch (err) {
      setUploadError(String(err))
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const importCompany = async (pb: PitchbookCompany) => {
    await supabase.from('companies').insert({
      name: pb.company_name,
      website: pb.website,
      industry: pb.industry,
      location: pb.hq_location,
      size: pb.employee_count,
      trigger_signal: pb.last_funding_type
        ? `${pb.last_funding_type} — ${pb.last_funding_amount || ''} (${pb.last_funding_date || ''})`
        : undefined,
      track: 'A',
      stage: 'prospect',
      source: 'pitchbook',
    })
    await supabase.from('pitchbook_companies').update({ status: 'imported', matched_company_id: null }).eq('id', pb.id)
    setReportCompanies((prev) => prev.map((p) => p.id === pb.id ? { ...p, status: 'imported' } : p))
  }

  const skipCompany = async (id: string) => {
    await supabase.from('pitchbook_companies').update({ status: 'skipped' }).eq('id', id)
    setReportCompanies((prev) => prev.map((p) => p.id === id ? { ...p, status: 'skipped' } : p))
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Data Imports</h1>
        <p className="text-muted-foreground text-sm mt-1">Upload PitchBook reports and lease comps</p>
      </div>

      <Tabs defaultValue="pitchbook">
        <TabsList>
          <TabsTrigger value="pitchbook">PitchBook Reports</TabsTrigger>
          <TabsTrigger value="comps">Lease Comps</TabsTrigger>
        </TabsList>

        <TabsContent value="pitchbook" className="space-y-4 mt-4">
          {/* Upload area */}
          <Card>
            <CardContent className="p-6">
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <UploadCloud className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium mb-1">Upload PitchBook CSV Export</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Export from PitchBook → Companies → Save as CSV. Any standard export format works.
                </p>
                <label className="cursor-pointer">
                  <input type="file" accept=".csv" className="hidden" onChange={uploadPitchbook} disabled={uploading} />
                  <Button size="sm" disabled={uploading}>
                    <>
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                      {uploading ? 'Processing…' : 'Choose CSV'}
                    </>
                  </Button>
                </label>
                {uploadResult && (
                  <div className="flex items-center justify-center gap-2 mt-3 text-green-600 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    {uploadResult.count} companies imported from report
                  </div>
                )}
                {uploadError && (
                  <div className="flex items-center justify-center gap-2 mt-3 text-red-500 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {uploadError}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Report history */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-sm font-medium mb-3">Upload History</p>
              {reports.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reports uploaded yet.</p>
              ) : (
                <ul className="space-y-2">
                  {reports.map((r) => (
                    <li
                      key={r.id}
                      onClick={() => setSelectedReport(r.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedReport === r.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}
                    >
                      <div className="flex items-start gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{r.filename}</p>
                          <p className="text-xs text-muted-foreground">{r.record_count} records · {format(new Date(r.created_at), 'MMM d, yyyy')}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="lg:col-span-2">
              {selectedReport && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium">{reportCompanies.length} companies in this report</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => reportCompanies.filter(c => c.status === 'new').forEach(importCompany)}
                    >
                      Import All New
                    </Button>
                  </div>
                  <div className="overflow-auto max-h-96">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Company</th>
                          <th className="text-left px-3 py-2 font-medium">Industry</th>
                          <th className="text-left px-3 py-2 font-medium">Funding</th>
                          <th className="text-left px-3 py-2 font-medium">Location</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {reportCompanies.map((c) => (
                          <tr key={c.id} className={c.status !== 'new' ? 'opacity-50' : ''}>
                            <td className="px-3 py-2">
                              <p className="font-medium">{c.company_name}</p>
                              {c.ceo_name && <p className="text-muted-foreground">CEO: {c.ceo_name}</p>}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{c.industry}</td>
                            <td className="px-3 py-2">
                              {c.last_funding_amount && <p>{c.last_funding_amount}</p>}
                              {c.last_funding_type && <p className="text-muted-foreground">{c.last_funding_type}</p>}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{c.hq_location}</td>
                            <td className="px-3 py-2">
                              {c.status === 'new' && (
                                <div className="flex gap-1">
                                  <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => importCompany(c)}>Import</Button>
                                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => skipCompany(c.id)}>Skip</Button>
                                </div>
                              )}
                              {c.status !== 'new' && (
                                <Badge variant="outline" className="text-[10px] capitalize">{c.status}</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="comps" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <UploadCloud className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium mb-1">Upload Lease Comps CSV</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Export from CoStar or any source. Columns: Tenant, Address, City, State, SF, Rate, Term, Lease Type, Date.
                </p>
                <label className="cursor-pointer">
                  <input type="file" accept=".csv" className="hidden" onChange={uploadComps} disabled={uploading} />
                  <Button size="sm" disabled={uploading}>
                    <>
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                      {uploading ? 'Processing…' : 'Choose CSV'}
                    </>
                  </Button>
                </label>
                {uploadResult && (
                  <div className="flex items-center justify-center gap-2 mt-3 text-green-600 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    {uploadResult.count} comps imported
                  </div>
                )}
                {uploadError && (
                  <div className="flex items-center justify-center gap-2 mt-3 text-red-500 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {uploadError}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          <LeaseCompsTable />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function LeaseCompsTable() {
  const [comps, setComps] = useState<{ id: string; tenant_name?: string; address?: string; city?: string; state?: string; size_sf?: number; rate_per_sf?: number; lease_type?: string; deal_date?: string; vertical?: string }[]>([])

  useEffect(() => {
    supabase.from('lease_comps').select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => setComps(data || []))
  }, [])

  if (comps.length === 0) return null

  return (
    <div className="mt-6">
      <p className="text-sm font-medium mb-3">{comps.length} lease comps in database</p>
      <div className="overflow-auto max-h-72 border border-border rounded-lg">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Tenant</th>
              <th className="text-left px-3 py-2 font-medium">Location</th>
              <th className="text-left px-3 py-2 font-medium">SF</th>
              <th className="text-left px-3 py-2 font-medium">Rate</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-left px-3 py-2 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {comps.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2 font-medium">{c.tenant_name}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.city}{c.state ? `, ${c.state}` : ''}</td>
                <td className="px-3 py-2">{c.size_sf?.toLocaleString()}</td>
                <td className="px-3 py-2">{c.rate_per_sf ? `$${c.rate_per_sf}` : '—'}</td>
                <td className="px-3 py-2">{c.lease_type}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.deal_date ? new Date(c.deal_date).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
