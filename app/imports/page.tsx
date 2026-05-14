'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { PitchbookReport, PitchbookCompany } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { UploadCloud, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'

// Detect row color from Excel cell fill → returns 'red' | 'green' | 'yellow' | null
function detectRowColor(ws: XLSX.WorkSheet, rowIndex: number): 'red' | 'green' | 'yellow' | null {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  // Check first few cells in the row for a fill color
  for (let col = range.s.c; col <= Math.min(range.s.c + 5, range.e.c); col++) {
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c: col })
    const cell = ws[addr]
    if (!cell?.s?.fill) continue
    const fill = cell.s.fill
    const rgb: string = fill.fgColor?.rgb || fill.bgColor?.rgb || ''
    if (!rgb || rgb === 'FFFFFF' || rgb === 'FF000000' || rgb.length < 6) continue
    // ARGB format: last 6 chars are RRGGBB
    const hex = rgb.slice(-6).toUpperCase()
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    // Red: high R, low G+B
    if (r > 180 && g < 100 && b < 100) return 'red'
    // Green: high G, low R+B
    if (g > 150 && r < 150 && b < 100) return 'green'
    // Yellow/Orange: high R+G, low B
    if (r > 180 && g > 130 && b < 100) return 'yellow'
  }
  return null
}

// Parse spreadsheet with cell style support for color detection
function parseSpreadsheetWithColors(file: File): Promise<{ rows: Record<string, string>[]; ws: XLSX.WorkSheet; headerRow: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const wb = XLSX.read(data, { type: 'binary', cellStyles: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
        resolve({ rows, ws, headerRow: range.s.r })
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsBinaryString(file)
  })
}

// Parse any spreadsheet (CSV or Excel) into rows — simple version for non-color use
function parseSpreadsheet(file: File): Promise<Record<string, string>[]> {
  return parseSpreadsheetWithColors(file).then(r => r.rows)
}

function getCol(row: Record<string, string>, ...keys: string[]) {
  return keys.map(k => row[k]).find(v => v && String(v).trim()) || ''
}

export default function ImportsPage() {
  const [reports, setReports] = useState<PitchbookReport[]>([])
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [reportCompanies, setReportCompanies] = useState<PitchbookCompany[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ count: number; type: string } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // General import state
  const [importType, setImportType] = useState<'companies' | 'contacts'>('companies')
  const [importCompanyId, setImportCompanyId] = useState('')
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [previewFile, setPreviewFile] = useState<File | null>(null)

  const pbRef = useRef<HTMLInputElement>(null)
  const compsRef = useRef<HTMLInputElement>(null)
  const generalRef = useRef<HTMLInputElement>(null)

  const fetchReports = async () => {
    const { data } = await supabase.from('pitchbook_reports').select('*').order('created_at', { ascending: false })
    setReports(data || [])
  }

  useEffect(() => { fetchReports() }, [])
  useEffect(() => {
    supabase.from('companies').select('id, name').order('name').then(({ data }) => setCompanies(data || []))
  }, [])
  useEffect(() => {
    if (selectedReport) {
      supabase.from('pitchbook_companies').select('*').eq('report_id', selectedReport).order('company_name')
        .then(({ data }) => setReportCompanies(data || []))
    }
  }, [selectedReport])

  const reset = () => { setUploadResult(null); setUploadError(null) }

  // PitchBook upload
  const uploadPitchbook = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); reset()
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/imports/pitchbook', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setUploadResult({ count: data.count, type: 'PitchBook companies' })
      fetchReports()
    } catch (err) { setUploadError(String(err)) }
    finally { setUploading(false); if (pbRef.current) pbRef.current.value = '' }
  }

  // Lease comps upload
  const uploadComps = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true); reset()
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/imports/comps', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setUploadResult({ count: data.count, type: 'lease comps' })
    } catch (err) { setUploadError(String(err)) }
    finally { setUploading(false); if (compsRef.current) compsRef.current.value = '' }
  }

  // General import — preview
  const handleGeneralPreview = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    reset()
    try {
      const rows = await parseSpreadsheet(file)
      setPreview(rows.slice(0, 5))
      setPreviewFile(file)
    } catch (err) { setUploadError(`Could not read file: ${err}`) }
  }

  // General import — confirm
  const confirmImport = async () => {
    if (!previewFile) return
    setUploading(true); reset()
    try {
      const { rows, ws, headerRow } = await parseSpreadsheetWithColors(previewFile)
      if (importType === 'companies') {
        const allMapped = rows.map((row, i) => {
          const rowIndex = headerRow + 1 + i // +1 for header row
          const color = detectRowColor(ws, rowIndex)
          if (color === 'red') return null // skip red rows

          const priority = color === 'green' ? 'high' : color === 'yellow' ? 'medium' : 'medium'

          return {
            name: getCol(row, 'Tenant/Company', 'Tenant', 'Company Name', 'Company', 'Tenant Name', 'Name', 'Organization', 'Account', 'Client'),
            website: getCol(row, 'Website', 'URL', 'Web'),
            industry: getCol(row, 'Industry', 'Sector', 'Vertical', 'Type'),
            location: getCol(row, 'HQ Location', 'Location', 'City', 'HQ City/State/Country'),
            size: getCol(row, 'Employees', 'Employee Count', 'Number of Employees', 'Size'),
            description: getCol(row, 'Description', 'Business Description', 'Summary'),
            notes: getCol(row, 'Notes', 'Comments', 'Remarks'),
            trigger_signal: getCol(row, 'Last Financing Type', 'Last Deal Type', 'Funding', 'Trigger'),
            property_name: getCol(row, 'Property', 'Property Name', 'Building'),
            address: getCol(row, 'Address', 'Street Address', 'Property Address'),
            owner_sublessor: getCol(row, 'Owner/Sublessor', 'Owner', 'Sublessor', 'Landlord'),
            date_leased: getCol(row, 'Date Leased', 'Lease Date', 'Commencement') || null,
            lease_term: getCol(row, 'Term', 'Lease Term', 'Duration'),
            leased_sf: parseInt(getCol(row, 'Leased SF', 'SF', 'Size (SF)', 'Square Feet', 'RSF')) || undefined,
            base_rent: getCol(row, 'Base Rent', 'Rent', 'Rate', 'Annual Rent'),
            expiration_date: getCol(row, 'Expiration', 'Lease Expiration', 'Expiry', 'Expire Date') || null,
            listing_agents: getCol(row, 'Listing Agents', 'Listing Agent', 'LL Rep', 'Landlord Rep'),
            procuring_agents: getCol(row, 'Procuring Agents', 'Procuring Agent', 'Tenant Rep', 'Tenant Agent'),
            priority,
            track: 'A' as const,
            stage: 'prospect' as const,
            source: 'import',
          }
        })
        const toInsert = allMapped.filter((c): c is NonNullable<typeof c> => !!c && !!(c.name?.trim()))
        const skipped = allMapped.filter(c => c === null).length
        if (toInsert.length === 0) throw new Error('No company/tenant names found. Make sure your spreadsheet has a column named "Tenant", "Company Name", or "Tenant/Company".')
        await supabase.from('companies').insert(toInsert)
        setUploadResult({ count: toInsert.length, type: `companies${skipped > 0 ? ` (${skipped} red rows skipped, green = high priority)` : ''}` })
      } else {
        const toInsert = rows.map(row => {
          const fullName = getCol(row, 'Name', 'Full Name', 'Contact Name')
          const [first, ...rest] = fullName.split(' ')
          return {
            first_name: getCol(row, 'First Name', 'First') || first || '',
            last_name: getCol(row, 'Last Name', 'Last') || rest.join(' ') || '',
            title: getCol(row, 'Title', 'Job Title', 'Position'),
            email: getCol(row, 'Email', 'Email Address', 'Work Email'),
            phone: getCol(row, 'Phone', 'Phone Number', 'Mobile'),
            linkedin_url: getCol(row, 'LinkedIn', 'LinkedIn URL'),
            company_id: importCompanyId || null,
            source: 'import',
          }
        }).filter(c => c.first_name || c.last_name || c.email)
        if (toInsert.length === 0) throw new Error('No contacts found. Check your column headers.')
        await supabase.from('contacts').insert(toInsert)
        setUploadResult({ count: toInsert.length, type: 'contacts' })
      }
      setPreview([])
      setPreviewFile(null)
      if (generalRef.current) generalRef.current.value = ''
    } catch (err) { setUploadError(String(err)) }
    finally { setUploading(false) }
  }

  const importCompany = async (pb: PitchbookCompany) => {
    await supabase.from('companies').insert({
      name: pb.company_name, website: pb.website, industry: pb.industry,
      location: pb.hq_location, size: pb.employee_count,
      trigger_signal: pb.last_funding_type ? `${pb.last_funding_type} — ${pb.last_funding_amount || ''} (${pb.last_funding_date || ''})` : undefined,
      track: 'A', stage: 'prospect', source: 'pitchbook',
    })
    await supabase.from('pitchbook_companies').update({ status: 'imported' }).eq('id', pb.id)
    setReportCompanies(prev => prev.map(p => p.id === pb.id ? { ...p, status: 'imported' } : p))
  }

  const skipCompany = async (id: string) => {
    await supabase.from('pitchbook_companies').update({ status: 'skipped' }).eq('id', id)
    setReportCompanies(prev => prev.map(p => p.id === id ? { ...p, status: 'skipped' } : p))
  }

  const UploadFeedback = () => (
    <>
      {uploadResult && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <strong>{uploadResult.count}</strong> {uploadResult.type} imported successfully
        </div>
      )}
      {uploadError && (
        <div className="flex items-start gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {uploadError}
        </div>
      )}
    </>
  )

  const DropZone = ({ label, hint, inputRef, onChange, accept = '.csv,.xlsx,.xls' }: {
    label: string; hint: string
    inputRef: React.RefObject<HTMLInputElement | null>
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    accept?: string
  }) => (
    <label className="cursor-pointer block">
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onChange} disabled={uploading} />
      <div className="border-2 border-dashed border-border rounded-xl p-10 text-center hover:border-primary/40 hover:bg-muted/30 transition-colors">
        <UploadCloud className="w-9 h-9 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm font-semibold mb-1">{label}</p>
        <p className="text-xs text-muted-foreground mb-4">{hint}</p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {uploading ? 'Processing…' : 'Choose File'}
        </div>
        <p className="text-xs text-muted-foreground mt-3">Supports .csv, .xlsx, .xls</p>
      </div>
    </label>
  )

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Data Imports</h1>
        <p className="text-muted-foreground text-sm mt-1">Upload spreadsheets to import leads, contacts, PitchBook reports, and lease comps</p>
      </div>

      <UploadFeedback />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">Import Leads / Contacts</TabsTrigger>
          <TabsTrigger value="pitchbook">PitchBook Reports</TabsTrigger>
          <TabsTrigger value="comps">Lease Comps</TabsTrigger>
        </TabsList>

        {/* ── GENERAL IMPORT ── */}
        <TabsContent value="general" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-6 space-y-5">
              <div className="flex gap-4 items-end">
                <div>
                  <Label>What are you importing?</Label>
                  <div className="flex gap-2 mt-2">
                    {(['companies', 'contacts'] as const).map(t => (
                      <button key={t} onClick={() => setImportType(t)}
                        className={`px-4 py-1.5 rounded-full text-sm border font-medium capitalize transition-colors ${importType === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                {importType === 'contacts' && (
                  <div>
                    <Label>Assign to company (optional)</Label>
                    <Select value={importCompanyId} onValueChange={(v) => v != null && setImportCompanyId(v)}>
                      <SelectTrigger className="w-52 mt-1"><SelectValue placeholder="No company" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No company</SelectItem>
                        {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <DropZone
                label={importType === 'companies' ? 'Upload Companies / Leads Spreadsheet' : 'Upload Contacts Spreadsheet'}
                hint={importType === 'companies'
                  ? 'Any spreadsheet with company names. Columns: Company Name, Industry, Website, Location, Employees, Description.'
                  : 'Any spreadsheet with contact names. Columns: First Name, Last Name, Title, Email, Phone, LinkedIn.'}
                inputRef={generalRef}
                onChange={handleGeneralPreview}
              />

              {/* Preview */}
              {preview.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Preview — first {preview.length} rows:</p>
                  <div className="overflow-auto border border-border rounded-lg max-h-48">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted">
                        <tr>{Object.keys(preview[0]).slice(0, 8).map(k => <th key={k} className="text-left px-3 py-2 font-medium">{k}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {preview.map((row, i) => (
                          <tr key={i}>{Object.values(row).slice(0, 8).map((v, j) => <td key={j} className="px-3 py-1.5 text-muted-foreground truncate max-w-32">{String(v)}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button onClick={confirmImport} disabled={uploading} className="gap-2">
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      {uploading ? 'Importing…' : `Import ${importType}`}
                    </Button>
                    <Button variant="outline" onClick={() => { setPreview([]); setPreviewFile(null); if (generalRef.current) generalRef.current.value = '' }}>
                      Cancel
                    </Button>
                    <p className="text-xs text-muted-foreground">Looks right? Click Import to add to CRM.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PITCHBOOK ── */}
        <TabsContent value="pitchbook" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-6">
              <DropZone
                label="Upload PitchBook CSV Export"
                hint="Export from PitchBook → Companies → Save as CSV or Excel."
                inputRef={pbRef}
                onChange={uploadPitchbook}
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-sm font-medium mb-3">Upload History</p>
              {reports.length === 0
                ? <p className="text-sm text-muted-foreground">No reports uploaded yet.</p>
                : <ul className="space-y-2">
                    {reports.map(r => (
                      <li key={r.id} onClick={() => setSelectedReport(r.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedReport === r.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
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
              }
            </div>
            <div className="lg:col-span-2">
              {selectedReport && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium">{reportCompanies.length} companies in this report</p>
                    <Button variant="outline" size="sm" onClick={() => reportCompanies.filter(c => c.status === 'new').forEach(importCompany)}>Import All New</Button>
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
                        {reportCompanies.map(c => (
                          <tr key={c.id} className={c.status !== 'new' ? 'opacity-50' : ''}>
                            <td className="px-3 py-2"><p className="font-medium">{c.company_name}</p>{c.ceo_name && <p className="text-muted-foreground">CEO: {c.ceo_name}</p>}</td>
                            <td className="px-3 py-2 text-muted-foreground">{c.industry}</td>
                            <td className="px-3 py-2">{c.last_funding_amount && <p>{c.last_funding_amount}</p>}{c.last_funding_type && <p className="text-muted-foreground">{c.last_funding_type}</p>}</td>
                            <td className="px-3 py-2 text-muted-foreground">{c.hq_location}</td>
                            <td className="px-3 py-2">
                              {c.status === 'new'
                                ? <div className="flex gap-1"><Button size="sm" className="h-6 text-[10px] px-2" onClick={() => importCompany(c)}>Import</Button><Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => skipCompany(c.id)}>Skip</Button></div>
                                : <Badge variant="outline" className="text-[10px] capitalize">{c.status}</Badge>}
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

        {/* ── COMPS ── */}
        <TabsContent value="comps" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <DropZone
                label="Upload Lease Comps"
                hint="Export from CoStar or any source. Columns: Tenant, Address, City, State, SF, Rate, Term, Lease Type, Date."
                inputRef={compsRef}
                onChange={uploadComps}
              />
            </CardContent>
          </Card>
          <LeaseCompsTable />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function LeaseCompsTable() {
  const [comps, setComps] = useState<{ id: string; tenant_name?: string; city?: string; state?: string; size_sf?: number; rate_per_sf?: number; lease_type?: string; deal_date?: string }[]>([])
  useEffect(() => {
    supabase.from('lease_comps').select('*').order('created_at', { ascending: false }).limit(100).then(({ data }) => setComps(data || []))
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
            {comps.map(c => (
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
