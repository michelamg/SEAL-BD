'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { PostCloseCheckin } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { format, isPast, isToday } from 'date-fns'

export default function FollowUpPage() {
  const [checkins, setCheckins] = useState<(PostCloseCheckin & { companies?: { name: string } | null; deals?: { deal_type: string; sf?: number } | null })[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'overdue'>('pending')

  const fetchCheckins = async () => {
    setLoading(true)
    let q = supabase
      .from('post_close_checkins')
      .select('*, companies(name), deals(deal_type, sf)')
      .order('scheduled_date')
    if (filter !== 'all') q = q.eq('status', 'pending')
    const { data } = await q
    setCheckins(
      filter === 'overdue'
        ? (data || []).filter((c) => c.status === 'pending' && isPast(new Date(c.scheduled_date)) && !isToday(new Date(c.scheduled_date)))
        : (data || [])
    )
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCheckins()
  }, [filter])

  const complete = async (id: string) => {
    await supabase.from('post_close_checkins').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id)
    fetchCheckins()
  }

  const LABEL: Record<string, string> = { '30_day': '30-Day', '60_day': '60-Day', '90_day': '90-Day' }
  const COLOR: Record<string, string> = { '30_day': 'bg-blue-100 text-blue-700', '60_day': 'bg-purple-100 text-purple-700', '90_day': 'bg-orange-100 text-orange-700' }

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Post-Close Follow-Up</h1>
        <p className="text-muted-foreground text-sm mt-1">30 / 60 / 90 day check-ins after close</p>
      </div>

      <div className="flex gap-2">
        {(['all', 'pending', 'overdue'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm border transition-colors capitalize ${filter === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
      ) : checkins.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No check-ins found.</p>
      ) : (
        <div className="space-y-3">
          {checkins.map((c) => {
            const overdue = c.status === 'pending' && isPast(new Date(c.scheduled_date)) && !isToday(new Date(c.scheduled_date))
            const dueToday = isToday(new Date(c.scheduled_date))
            return (
              <Card key={c.id} className={overdue ? 'border-red-200' : dueToday ? 'border-orange-200' : ''}>
                <CardContent className="p-4 flex items-center gap-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${COLOR[c.checkin_type] || 'bg-gray-100 text-gray-600'}`}>
                    {LABEL[c.checkin_type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{c.companies?.name || 'Unknown'}</p>
                    {c.deals && (
                      <p className="text-xs text-muted-foreground capitalize">
                        {c.deals.deal_type?.replace('_', ' ')} {c.deals.sf ? `· ${c.deals.sf.toLocaleString()} SF` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-medium">{format(new Date(c.scheduled_date), 'MMM d, yyyy')}</p>
                      {overdue && (
                        <p className="text-xs text-red-500 flex items-center gap-1 justify-end">
                          <AlertCircle className="w-3 h-3" />Overdue
                        </p>
                      )}
                      {dueToday && (
                        <p className="text-xs text-orange-500 flex items-center gap-1 justify-end">
                          <Clock className="w-3 h-3" />Due today
                        </p>
                      )}
                      {c.status === 'completed' && (
                        <p className="text-xs text-green-600 flex items-center gap-1 justify-end">
                          <CheckCircle2 className="w-3 h-3" />Done
                        </p>
                      )}
                    </div>
                    {c.status === 'pending' && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => complete(c.id)}>
                        <CheckCircle2 className="w-3.5 h-3.5" />Mark Done
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
