'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Company } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ContactsTab } from './contacts-tab'
import { OutreachTab } from './outreach-tab'

const VERTICALS = ['NIC', 'Tech', 'Life Sci', 'Defense', 'Pro Services', 'Other']
const STAGES = ['prospect', 'qualifying', 'active', 'nurturing', 'won', 'lost', 'disqualified']

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  company: Company | null
  onSaved: () => void
}

export function CompanyDialog({ open, onOpenChange, company, onSaved }: Props) {
  const [form, setForm] = useState<Partial<Company>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (company) setForm(company)
    else setForm({ track: 'A', stage: 'prospect', priority: 'medium' })
  }, [company, open])

  const set = (k: keyof Company, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    if (company?.id) {
      await supabase.from('companies').update({ ...form, updated_at: new Date().toISOString() }).eq('id', company.id)
    } else {
      await supabase.from('companies').insert({ ...form })
    }
    setSaving(false)
    onSaved()
    onOpenChange(false)
  }

  const remove = async () => {
    if (!company?.id || !confirm('Delete this company?')) return
    await supabase.from('companies').delete().eq('id', company.id)
    onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{company ? company.name : 'New Company'}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details">
          <TabsList className="mb-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="contacts" disabled={!company?.id}>Contacts</TabsTrigger>
            <TabsTrigger value="outreach" disabled={!company?.id}>Outreach</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Company Name *</Label>
                <Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div>
                <Label>Website</Label>
                <Input value={form.website || ''} onChange={(e) => set('website', e.target.value)} placeholder="https://" />
              </div>
              <div>
                <Label>Industry</Label>
                <Input value={form.industry || ''} onChange={(e) => set('industry', e.target.value)} />
              </div>
              <div>
                <Label>Vertical</Label>
                <Select value={form.vertical || ''} onValueChange={(v) => set('vertical', v)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{VERTICALS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Stage</Label>
                <Select value={form.stage || 'prospect'} onValueChange={(v) => set('stage', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Track</Label>
                <Select value={form.track || 'A'} onValueChange={(v) => set('track', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Track A — New Client</SelectItem>
                    <SelectItem value="B">Track B — Listing</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority || 'medium'} onValueChange={(v) => set('priority', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Location</Label>
                <Input value={form.location || ''} onChange={(e) => set('location', e.target.value)} placeholder="City, State" />
              </div>
              <div>
                <Label>Company Size</Label>
                <Select value={form.size || ''} onValueChange={(v) => set('size', v)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {['1-10','11-50','51-200','201-500','501-1000','1000+'].map(s => <SelectItem key={s} value={s}>{s} employees</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estimated SF Need</Label>
                <Input
                  type="number"
                  value={form.estimated_sf || ''}
                  onChange={(e) => set('estimated_sf', parseInt(e.target.value) || undefined)}
                  placeholder="e.g. 25000"
                />
              </div>
              <div className="col-span-2">
                <Label>Trigger Signal</Label>
                <Input
                  value={form.trigger_signal || ''}
                  onChange={(e) => set('trigger_signal', e.target.value)}
                  placeholder="e.g. $12M Series B raised March 2026"
                />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} rows={3} />
              </div>
            </div>
          </TabsContent>

          {company?.id && (
            <TabsContent value="contacts">
              <ContactsTab companyId={company.id} />
            </TabsContent>
          )}

          {company?.id && (
            <TabsContent value="outreach">
              <OutreachTab companyId={company.id} />
            </TabsContent>
          )}
        </Tabs>

        <div className="flex items-center justify-between pt-2 border-t border-border mt-2">
          {company?.id ? (
            <Button variant="destructive" size="sm" onClick={remove}>Delete</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving || !form.name}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
