'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Listing } from '@/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const VERTICALS = ['NIC', 'Tech', 'Life Sci', 'Defense', 'Pro Services', 'Other']

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  listing: Listing | null
  onSaved: () => void
}

export function ListingDialog({ open, onOpenChange, listing, onSaved }: Props) {
  const [form, setForm] = useState<Partial<Listing>>({})
  const [saving, setSaving] = useState(false)
  const [selectedVerticals, setSelectedVerticals] = useState<string[]>([])

  useEffect(() => {
    if (listing) {
      setForm(listing)
      setSelectedVerticals(listing.target_verticals || [])
    } else {
      setForm({ status: 'active' })
      setSelectedVerticals([])
    }
  }, [listing, open])

  const set = (k: keyof Listing, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const toggleVertical = (v: string) => {
    setSelectedVerticals((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v])
  }

  const save = async () => {
    setSaving(true)
    const payload = { ...form, target_verticals: selectedVerticals }
    if (listing?.id) {
      await supabase.from('listings').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', listing.id)
    } else {
      await supabase.from('listings').insert(payload)
    }
    setSaving(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{listing ? `Edit: ${listing.name}` : 'New Listing'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Listing Name *</Label>
              <Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="Torreyana, Dallesport, GLC…" />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input value={form.address || ''} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div>
              <Label>City</Label>
              <Input value={form.city || ''} onChange={(e) => set('city', e.target.value)} />
            </div>
            <div>
              <Label>State</Label>
              <Input value={form.state || ''} onChange={(e) => set('state', e.target.value)} />
            </div>
            <div>
              <Label>Submarket</Label>
              <Input value={form.submarket || ''} onChange={(e) => set('submarket', e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status || 'active'} onValueChange={(v) => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="under_negotiation">Under Negotiation</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="off_market">Off Market</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Total SF</Label>
              <Input type="number" value={form.size_sf || ''} onChange={(e) => set('size_sf', parseInt(e.target.value) || undefined)} />
            </div>
            <div>
              <Label>Asking Rate ($/SF/yr)</Label>
              <Input type="number" step="0.01" value={form.asking_rate || ''} onChange={(e) => set('asking_rate', parseFloat(e.target.value) || undefined)} />
            </div>
            <div>
              <Label>Lease Type</Label>
              <Select value={form.lease_type || ''} onValueChange={(v) => set('lease_type', v)}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NNN">NNN</SelectItem>
                  <SelectItem value="Gross">Gross</SelectItem>
                  <SelectItem value="Modified Gross">Modified Gross</SelectItem>
                  <SelectItem value="FSG">Full Service Gross</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Available Date</Label>
              <Input type="date" value={form.available_date || ''} onChange={(e) => set('available_date', e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Client / Owner</Label>
              <Input value={form.client_name || ''} onChange={(e) => set('client_name', e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Target Verticals</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {VERTICALS.map((v) => (
                <button
                  key={v}
                  onClick={() => toggleVertical(v)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    selectedVerticals.includes(v)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={form.description || ''} onChange={(e) => set('description', e.target.value)} rows={2} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !form.name}>
            {saving ? 'Saving…' : 'Save Listing'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
