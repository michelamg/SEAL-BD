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
import { IdeasTab } from './ideas-tab'

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
            <TabsTrigger value="ideas" disabled={!company?.id}>Ideas</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            {/* Core Info */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Company Info</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Tenant / Company Name *</Label>
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
                  <Label>Trigger Signal</Label>
                  <Input value={(form as Record<string, unknown>).trigger_signal as string || ''} onChange={(e) => set('trigger_signal' as keyof Company, e.target.value)} placeholder="e.g. Series B, expansion…" />
                </div>
              </div>
            </div>

            {/* Lease Info */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 pt-2 border-t border-border">Lease Info</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Property</Label>
                  <Input value={(form as Record<string, unknown>).property_name as string || ''} onChange={(e) => set('property_name' as keyof Company, e.target.value)} />
                </div>
                <div>
                  <Label>Address</Label>
                  <Input value={(form as Record<string, unknown>).address as string || ''} onChange={(e) => set('address' as keyof Company, e.target.value)} />
                </div>
                <div>
                  <Label>Owner / Sublessor</Label>
                  <Input value={(form as Record<string, unknown>).owner_sublessor as string || ''} onChange={(e) => set('owner_sublessor' as keyof Company, e.target.value)} />
                </div>
                <div>
                  <Label>Date Leased</Label>
                  <Input type="date" value={(form as Record<string, unknown>).date_leased as string || ''} onChange={(e) => set('date_leased' as keyof Company, e.target.value)} />
                </div>
                <div>
                  <Label>Term</Label>
                  <Input value={(form as Record<string, unknown>).lease_term as string || ''} onChange={(e) => set('lease_term' as keyof Company, e.target.value)} placeholder="e.g. 60 Mos." />
                </div>
                <div>
                  <Label>Leased SF</Label>
                  <Input type="number" value={(form as Record<string, unknown>).leased_sf as number || ''} onChange={(e) => set('leased_sf' as keyof Company, parseInt(e.target.value) || undefined)} />
                </div>
                <div>
                  <Label>Base Rent</Label>
                  <Input value={(form as Record<string, unknown>).base_rent as string || ''} onChange={(e) => set('base_rent' as keyof Company, e.target.value)} placeholder="e.g. $45/SF/yr" />
                </div>
                <div>
                  <Label>Expiration</Label>
                  <Input type="date" value={(form as Record<string, unknown>).expiration_date as string || ''} onChange={(e) => set('expiration_date' as keyof Company, e.target.value)} />
                </div>
                <div>
                  <Label>Listing Agents</Label>
                  <Input value={(form as Record<string, unknown>).listing_agents as string || ''} onChange={(e) => set('listing_agents' as keyof Company, e.target.value)} />
                </div>
                <div>
                  <Label>Procuring Agents</Label>
                  <Input value={(form as Record<string, unknown>).procuring_agents as string || ''} onChange={(e) => set('procuring_agents' as keyof Company, e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label>Notes</Label>
                  <Textarea value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} rows={2} />
                </div>
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

          {company?.id && (
            <TabsContent value="ideas">
              <IdeasTab company={company} />
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
