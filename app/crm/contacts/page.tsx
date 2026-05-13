'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Contact } from '@/types'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Search, Mail, Phone, Link2 } from 'lucide-react'

export default function ContactsPage() {
  const [contacts, setContacts] = useState<(Contact & { companies?: { name: string } | null })[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [csuite, setCsuite] = useState(false)

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('contacts')
      .select('*, companies(name)')
      .order('last_name')
      .limit(200)
    if (search) q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
    if (csuite) q = q.eq('is_c_suite', true)
    const { data } = await q
    setContacts(data || [])
    setLoading(false)
  }, [search, csuite])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Contacts</h1>
        <p className="text-muted-foreground text-sm mt-1">{contacts.length} contacts across all accounts</p>
      </div>

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
                    <tr key={c.id} className="hover:bg-muted/20">
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
                        {c.phone ? (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />{c.phone}
                          </span>
                        ) : '—'}
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
    </div>
  )
}
