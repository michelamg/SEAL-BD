'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Contact } from '@/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Mail, Phone, Link2, UploadCloud, Plus, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { parse } from 'csv-parse/browser/esm/sync'

function parseContactsCSV(text: string): Partial<Contact>[] {
  const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true }) as Record<string, string>[]
  return rows.map((row) => {
    const get = (...keys: string[]) => keys.map(k => row[k]).find(v => v && v.trim()) || ''
    const fullName = get('Name', 'Full Name', 'Contact Name')
    const [first, ...rest] = fullName.split(' ')
    return {
      first_name: get('First Name', 'First') || first || '',
      last_name: get('Last Name', 'Last') || rest.join(' ') || '',
      title: get('Title', 'Job Title', 'Position', 'Role'),
      email: get('Email', 'Email Address', 'Work Email'),
      phone: get('Phone', 'Phone Number', 'Mobile', 'Direct Phone'),
      linkedin_url: get('LinkedIn', 'LinkedIn URL', 'LinkedIn Profile'),
      is_c_suite: ['ceo','cfo','coo','cto','president','chief','founder','partner','managing director']
        .some(k => get('Title','Job Title','Position').toLowerCase().includes(k)),
      source: 'import',
    }
  }).filter(c => c.first_name || c.last_name || c.email)
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<(Contact & { companies?: { name: string } | null })[]>([])
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [csuite, setCsuite] = useState(false)

  // Add / Edit
  const [addOpen, setAddOpen] = useState(false)
  const [editContact, setEditContact] = useState<(Contact & { companies?: { name: string } | null }) | null>(null)
  const [form, setForm] = useState<Partial<Contact & { company_id: string }>>({})
  const [saving, setSaving] = useState(false)

  const openEdit = (c: Contact & { companies?: { name: string } | null }) => {
    setEditContact(c)
    setForm({ ...c, company_id: (c as unknown as Record<string, unknown>).company_id as string || '' })
    setAddOpen(true)
  }

  // CSV upload
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [uploadCompanyId, setUploadCompanyId] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('contacts').select('*, companies(name)').order('last_name').limit(500)
    if (search) q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
    if (csuite) q = q.eq('is_c_suite', true)
    const { data } = await q
    setContacts(data || [])
    setLoading(false)
  }, [search, csuite])

  useEffect(() => { fetchContacts() }, [fetchContacts])
  useEffect(() => {
    supabase.from('companies').select('id, name').order('name').then(({ data }) => setCompanies(data || []))
  }, [])

  const saveContact = async () => {
    if (!form.first_name && !form.last_name) return
    setSaving(true)
    if (editContact?.id) {
      await supabase.from('contacts').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editContact.id)
    } else {
      await supabase.from('contacts').insert({ ...form, source: 'manual' })
    }
    setSaving(false)
    setAddOpen(false)
    setEditContact(null)
    setForm({})
    fetchContacts()
  }

  const deleteContact = async () => {
    if (!editContact?.id || !confirm('Delete this contact?')) return
    await supabase.from('contacts').delete().eq('id', editContact.id)
    setAddOpen(false)
    setEditContact(null)
    setForm({})
    fetchContacts()
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadMsg(null)
    try {
      const text = await file.text()
      const parsed = parseContactsCSV(text)
      if (parsed.length === 0) {
        setUploadMsg({ type: 'error', text: 'No contacts found. Check your column headers.' })
        return
      }
      await supabase.from('contacts').insert(
        parsed.map(c => ({ ...c, company_id: uploadCompanyId || null }))
      )
      setUploadMsg({ type: 'success', text: `${parsed.length} contacts imported successfully!` })
      fetchContacts()
    } catch (err) {
      setUploadMsg({ type: 'error', text: `Parse error: ${err}` })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-muted-foreground text-sm mt-1">{contacts.length} contacts across all accounts</p>
        </div>
        <div className="flex gap-2">
          {/* CSV Upload */}
          <label className="cursor-pointer">
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={uploading} />
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors
              ${uploading ? 'opacity-50' : 'hover:bg-muted cursor-pointer'} border-border bg-background`}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              Import CSV
            </div>
          </label>
          {/* Add individual */}
          <Button size="sm" className="gap-1.5" onClick={() => { setEditContact(null); setForm({}); setAddOpen(true) }}>
            <Plus className="w-4 h-4" /> Add Contact
          </Button>
        </div>
      </div>

      {/* Upload feedback */}
      {uploadMsg && (
        <div className={`flex items-start gap-2 text-sm px-4 py-3 rounded-lg ${
          uploadMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          {uploadMsg.type === 'success' ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          <div>
            <p>{uploadMsg.text}</p>
            {uploadMsg.type === 'error' && (
              <p className="text-xs mt-0.5 opacity-75">Expected columns: First Name, Last Name, Title, Email, Phone, LinkedIn</p>
            )}
          </div>
        </div>
      )}

      {/* Company selector for CSV upload */}
      {!uploading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Assign CSV imports to company:</span>
          <Select value={uploadCompanyId} onValueChange={(v) => v != null && setUploadCompanyId(v)}>
            <SelectTrigger className="h-7 w-48 text-xs"><SelectValue placeholder="No company (unassigned)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">No company</SelectItem>
              {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search contacts…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-56 h-9" />
        </div>
        <button
          onClick={() => setCsuite(!csuite)}
          className={`px-4 h-9 rounded-md text-sm border transition-colors ${csuite ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
        >
          C-Suite Only
        </button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No contacts found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Phone</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Source</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {contacts.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => openEdit(c)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{c.first_name} {c.last_name}</p>
                          {c.is_c_suite && <Badge variant="outline" className="text-[10px]">C-Suite</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.title || '—'}</td>
                      <td className="px-4 py-3">{c.companies?.name || '—'}</td>
                      <td className="px-4 py-3">
                        {c.email ? (
                          <a href={`mailto:${c.email}`} className="text-blue-600 flex items-center gap-1 hover:underline">
                            <Mail className="w-3 h-3" />{c.email}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.phone ? <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span> : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {c.source && <Badge variant="outline" className="text-[10px] capitalize">{c.source}</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        {c.linkedin_url && (
                          <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-sky-600">
                            <Link2 className="w-3.5 h-3.5" />
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

      {/* Add Contact Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editContact ? `${editContact.first_name} ${editContact.last_name}` : 'Add Contact'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>First Name *</Label><Input value={form.first_name || ''} onChange={(e) => set('first_name', e.target.value)} /></div>
              <div><Label>Last Name *</Label><Input value={form.last_name || ''} onChange={(e) => set('last_name', e.target.value)} /></div>
              <div><Label>Title</Label><Input value={form.title || ''} onChange={(e) => set('title', e.target.value)} /></div>
              <div><Label>Email</Label><Input value={form.email || ''} onChange={(e) => set('email', e.target.value)} /></div>
              <div><Label>Phone</Label><Input value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} /></div>
              <div><Label>LinkedIn URL</Label><Input value={form.linkedin_url || ''} onChange={(e) => set('linkedin_url', e.target.value)} /></div>
            </div>
            <div>
              <Label>Company</Label>
              <Select value={form.company_id || ''} onValueChange={(v) => v != null && set('company_id', v || null)}>
                <SelectTrigger><SelectValue placeholder="Select company…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No company</SelectItem>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="csuite-add" checked={!!form.is_c_suite} onChange={(e) => set('is_c_suite', e.target.checked)} />
              <label htmlFor="csuite-add" className="text-sm">C-Suite / Decision Maker</label>
            </div>
            {(form as Record<string, unknown>).notes !== undefined && (
              <div>
                <Label>Notes</Label>
                <Input value={(form as Record<string, unknown>).notes as string || ''} onChange={(e) => set('notes' as keyof Contact, e.target.value)} />
              </div>
            )}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            {editContact ? (
              <Button variant="destructive" size="sm" onClick={deleteContact}>Delete</Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setAddOpen(false); setEditContact(null); setForm({}) }}>Cancel</Button>
              <Button size="sm" onClick={saveContact} disabled={saving || (!form.first_name && !form.last_name)}>
                {saving ? 'Saving…' : editContact ? 'Save Changes' : 'Add Contact'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
