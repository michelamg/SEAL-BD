'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sparkles, Loader2 } from 'lucide-react'
import type { Contact } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  companyId: string
  onSaved: () => void
}

export function OutreachDialog({ open, onOpenChange, companyId, onSaved }: Props) {
  const [type, setType] = useState('email')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState('draft')
  const [followUpDate, setFollowUpDate] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactId, setContactId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      supabase.from('contacts').select('*').eq('company_id', companyId).then(({ data }) => setContacts(data || []))
    }
  }, [open, companyId])

  const generate = async () => {
    setGenerating(true)
    try {
      const { data: company } = await supabase
        .from('companies')
        .select('name, vertical, trigger_signal, location')
        .eq('id', companyId)
        .single()

      const contact = contacts.find((c) => c.id === contactId)

      const res = await fetch('/api/outreach/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: company?.name,
          vertical: company?.vertical,
          triggerSignal: company?.trigger_signal,
          location: company?.location,
          recipientName: contact ? `${contact.first_name} ${contact.last_name}` : undefined,
          recipientTitle: contact?.title,
        }),
      })
      const { subject: s, body: b } = await res.json()
      setSubject(s)
      setBody(b)
    } finally {
      setGenerating(false)
    }
  }

  const save = async () => {
    setSaving(true)
    await supabase.from('outreach_activities').insert({
      company_id: companyId,
      contact_id: contactId || null,
      track: 'A',
      type,
      subject,
      body,
      status,
      follow_up_date: followUpDate || null,
      ai_generated: false,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    })
    setSaving(false)
    onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Log Outreach</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => v != null && setType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['email','call','meeting','content_drop','linkedin','proposal'].map(t => (
                    <SelectItem key={t} value={t} className="capitalize">{t.replace('_',' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => v != null && setStatus(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['draft','sent','opened','replied','no_response','bounced'].map(s => (
                    <SelectItem key={s} value={s} className="capitalize">{s.replace('_',' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Contact (optional)</Label>
            <Select value={contactId} onValueChange={(v) => v != null && setContactId(v)}>
              <SelectTrigger><SelectValue placeholder="Select contact…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">No specific contact</SelectItem>
                {contacts.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {type === 'email' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Subject</Label>
                  <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs text-purple-600" onClick={generate} disabled={generating}>
                    {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    AI Draft
                  </Button>
                </div>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <Label>Body</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
              </div>
            </>
          )}
          <div>
            <Label>Follow-Up Date</Label>
            <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Log Activity'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
