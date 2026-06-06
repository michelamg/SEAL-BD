'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Contact } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Link2, Mail, UploadCloud, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
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

export function ContactsTab({ companyId }: { companyId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<Partial<Contact>>({})
  const [enriching, setEnriching] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchContacts = async () => {
    const { data } = await supabase.from('contacts').select('*').eq('company_id', companyId).order('is_c_suite', { ascending: false })
    setContacts(data || [])
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchContacts() }, [companyId])

  const save = async () => {
    if (!form.first_name && !form.last_name) return
    await supabase.from('contacts').insert({ ...form, company_id: companyId })
    setForm({})
    setAdding(false)
    fetchContacts()
  }

  const remove = async (id: string) => {
    await supabase.from('contacts').delete().eq('id', id)
    fetchContacts()
  }

  const enrichFromApollo = async () => {
    setEnriching(true)
    try {
      const { data: company } = await supabase.from('companies').select('name, website').eq('id', companyId).single()
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: company?.name, domain: company?.website }),
      })
      const { contacts: newContacts } = await res.json()
      if (newContacts?.length) {
        await supabase.from('contacts').insert(newContacts.map((c: Partial<Contact>) => ({ ...c, company_id: companyId })))
        fetchContacts()
      }
    } finally {
      setEnriching(false)
    }
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
        setUploadMsg({ type: 'error', text: 'No contacts found. Check column headers.' })
        return
      }
      await supabase.from('contacts').insert(parsed.map(c => ({ ...c, company_id: companyId })))
      setUploadMsg({ type: 'success', text: `${parsed.length} contacts imported!` })
      fetchContacts()
    } catch (err) {
      setUploadMsg({ type: 'error', text: `Error parsing file: ${err}` })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const set = (k: keyof Contact, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{contacts.length} contacts</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={enrichFromApollo} disabled={enriching}>
            {enriching ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Enriching…</> : 'Enrich via Apollo'}
          </Button>

          {/* Upload spreadsheet */}
          <label className="cursor-pointer">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors
              ${uploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted cursor-pointer'}
              border-border text-foreground bg-background`}
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
              Import CSV
            </div>
          </label>

          {/* Add individual */}
          <Button size="sm" className="gap-1" onClick={() => { setAdding(true); setUploadMsg(null) }}>
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>
      </div>

      {/* Upload feedback */}
      {uploadMsg && (
        <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-md ${
          uploadMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
        }`}>
          {uploadMsg.type === 'success'
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          {uploadMsg.text}
          {uploadMsg.type === 'error' && (
            <span className="text-xs ml-1 opacity-70">
              Expected columns: First Name, Last Name, Title, Email, Phone, LinkedIn
            </span>
          )}
        </div>
      )}

      {/* Add individual form */}
      {adding && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground">New Contact</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">First Name *</Label><Input value={form.first_name || ''} onChange={(e) => set('first_name', e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Last Name *</Label><Input value={form.last_name || ''} onChange={(e) => set('last_name', e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Title</Label><Input value={form.title || ''} onChange={(e) => set('title', e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Email</Label><Input value={form.email || ''} onChange={(e) => set('email', e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Phone</Label><Input value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">LinkedIn URL</Label><Input value={form.linkedin_url || ''} onChange={(e) => set('linkedin_url', e.target.value)} className="h-8" /></div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="csuite" checked={!!form.is_c_suite} onChange={(e) => set('is_c_suite', e.target.checked)} />
            <label htmlFor="csuite" className="text-xs">C-Suite / Decision Maker</label>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => { setAdding(false); setForm({}) }}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={!form.first_name && !form.last_name}>Add Contact</Button>
          </div>
        </div>
      )}

      {/* Contact list */}
      <ul className="divide-y divide-border">
        {contacts.map((c) => (
          <li key={c.id} className="flex items-start justify-between py-3 gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{c.first_name} {c.last_name}</p>
                {c.is_c_suite && <Badge variant="outline" className="text-[10px]">C-Suite</Badge>}
                {c.source === 'import' && <Badge variant="outline" className="text-[10px] text-muted-foreground">imported</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{c.title}</p>
              <div className="flex items-center gap-3 mt-1">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
                    <Mail className="w-3 h-3" />{c.email}
                  </a>
                )}
                {c.linkedin_url && (
                  <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 flex items-center gap-1 hover:underline">
                    <Link2 className="w-3 h-3" />LinkedIn
                  </a>
                )}
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => remove(c.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </li>
        ))}
        {contacts.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No contacts yet — add one, import a CSV, or enrich via Apollo.
          </p>
        )}
      </ul>
    </div>
  )
}
