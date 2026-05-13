'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sparkles, Plus, FileText, Loader2 } from 'lucide-react'

const VERTICALS = ['NIC', 'Tech', 'Life Sci', 'Defense', 'Pro Services']
const QUARTERS = ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 'Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025']

interface TLItem {
  id: string
  title: string
  vertical?: string
  quarter?: string
  description?: string
  file_url?: string
  distributed_count: number
  created_at: string
}

export default function ThoughtLeadershipPage() {
  const [items, setItems] = useState<TLItem[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [form, setForm] = useState<Partial<TLItem>>({})
  const [aiVertical, setAiVertical] = useState('Tech')
  const [aiQuarter, setAiQuarter] = useState(QUARTERS[0])
  const [aiResult, setAiResult] = useState<{ title?: string; executive_summary?: string; sections?: { heading: string; key_points: string[] }[] } | null>(null)
  const [generating, setGenerating] = useState(false)

  const fetchItems = async () => {
    const { data } = await supabase.from('thought_leadership').select('*').order('created_at', { ascending: false })
    setItems(data || [])
  }

  useEffect(() => { fetchItems() }, [])

  const save = async () => {
    await supabase.from('thought_leadership').insert(form)
    setForm({})
    setDialogOpen(false)
    fetchItems()
  }

  const generateOutline = async () => {
    setGenerating(true)
    setAiResult(null)
    try {
      const res = await fetch('/api/thought-leadership/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vertical: aiVertical, quarter: aiQuarter }),
      })
      setAiResult(await res.json())
    } finally {
      setGenerating(false)
    }
  }

  const distribute = async (id: string, count: number) => {
    await supabase.from('thought_leadership').update({ distributed_count: count + 1 }).eq('id', id)
    fetchItems()
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Thought Leadership</h1>
          <p className="text-muted-foreground text-sm mt-1">Quarterly vertical white papers & content distribution</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAiOpen(true)}>
            <Sparkles className="w-4 h-4" /> AI Outline
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <Card key={item.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <FileText className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex gap-1.5">
                  {item.vertical && <Badge variant="outline" className="text-xs">{item.vertical}</Badge>}
                  {item.quarter && <Badge variant="outline" className="text-xs">{item.quarter}</Badge>}
                </div>
              </div>
              <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
              {item.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{item.description}</p>}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{item.distributed_count} distributions</p>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => distribute(item.id, item.distributed_count)}>
                  + Distribute
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && (
          <div className="col-span-3 text-center py-16 text-muted-foreground text-sm">
            No content yet. Use AI Outline to generate a quarterly white paper.
          </div>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Content</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={form.title || ''} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vertical</Label>
                <Select value={form.vertical || ''} onValueChange={(v) => setForm(f => ({ ...f, vertical: v ?? undefined }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{VERTICALS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quarter</Label>
                <Select value={form.quarter || ''} onValueChange={(v) => setForm(f => ({ ...f, quarter: v ?? undefined }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{QUARTERS.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description || ''} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={3} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={!form.title}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Outline dialog */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>AI White Paper Outline</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <Label>Vertical</Label>
              <Select value={aiVertical} onValueChange={(v) => v != null && setAiVertical(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{VERTICALS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quarter</Label>
              <Select value={aiQuarter} onValueChange={(v) => v != null && setAiQuarter(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{QUARTERS.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={generateOutline} disabled={generating} className="gap-2 w-full">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Generating…' : 'Generate Outline'}
          </Button>

          {aiResult && (
            <div className="mt-4 space-y-4 border border-border rounded-lg p-4">
              <h3 className="font-semibold">{aiResult.title}</h3>
              {aiResult.executive_summary && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Executive Summary</p>
                  <p className="text-sm">{aiResult.executive_summary}</p>
                </div>
              )}
              {aiResult.sections?.map((s: { heading: string; key_points: string[] }, i: number) => (
                <div key={i}>
                  <p className="text-sm font-semibold mb-1">{s.heading}</p>
                  <ul className="space-y-1">
                    {s.key_points.map((pt: string, j: number) => (
                      <li key={j} className="text-xs text-muted-foreground flex gap-2">
                        <span className="text-primary shrink-0">•</span>{pt}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <Button
                size="sm"
                onClick={() => {
                  setForm({ title: aiResult?.title, vertical: aiVertical, quarter: aiQuarter, description: aiResult?.executive_summary })
                  setAiOpen(false)
                  setDialogOpen(true)
                }}
              >
                Save to Library
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
