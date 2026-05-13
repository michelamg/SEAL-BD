'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Contact } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Link2, Mail } from 'lucide-react'

export function ContactsTab({ companyId }: { companyId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<Partial<Contact>>({})
  const [enriching, setEnriching] = useState(false)

  const fetchContacts = async () => {
    const { data } = await supabase.from('contacts').select('*').eq('company_id', companyId).order('is_c_suite', { ascending: false })
    setContacts(data || [])
  }

  useEffect(() => { fetchContacts() }, [companyId])

  const save = async () => {
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

  const set = (k: keyof Contact, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{contacts.length} contacts</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={enrichFromApollo} disabled={enriching}>
            {enriching ? 'Enriching…' : 'Enrich via Apollo'}
          </Button>
          <Button size="sm" className="gap-1" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>
      </div>

      {adding && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">First Name</Label><Input value={form.first_name || ''} onChange={(e) => set('first_name', e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Last Name</Label><Input value={form.last_name || ''} onChange={(e) => set('last_name', e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Title</Label><Input value={form.title || ''} onChange={(e) => set('title', e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Email</Label><Input value={form.email || ''} onChange={(e) => set('email', e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Phone</Label><Input value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">LinkedIn</Label><Input value={form.linkedin_url || ''} onChange={(e) => set('linkedin_url', e.target.value)} className="h-8" /></div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="csuite" checked={!!form.is_c_suite} onChange={(e) => set('is_c_suite', e.target.checked)} />
            <label htmlFor="csuite" className="text-xs">C-Suite</label>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={!form.first_name || !form.last_name}>Add Contact</Button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-border">
        {contacts.map((c) => (
          <li key={c.id} className="flex items-start justify-between py-3 gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{c.first_name} {c.last_name}</p>
                {c.is_c_suite && <Badge variant="outline" className="text-[10px]">C-Suite</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{c.title}</p>
              <div className="flex items-center gap-3 mt-1">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="text-xs text-blue-600 flex items-center gap-1">
                    <Mail className="w-3 h-3" />{c.email}
                  </a>
                )}
                {c.linkedin_url && (
                  <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 flex items-center gap-1">
                    <Link2 className="w-3 h-3" />LinkedIn
                  </a>
                )}
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => remove(c.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </li>
        ))}
        {contacts.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-6">No contacts yet. Add manually or enrich via Apollo.</p>
        )}
      </ul>
    </div>
  )
}
