'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { OutreachActivity } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from 'date-fns'
import { Mail, Phone, Users, FileText, Link2, Sparkles } from 'lucide-react'

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail, call: Phone, meeting: Users, content_drop: FileText, linkedin: Link2,
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700',
  opened: 'bg-purple-100 text-purple-700', replied: 'bg-green-100 text-green-700',
  no_response: 'bg-yellow-100 text-yellow-700', bounced: 'bg-red-100 text-red-600',
}

export default function OutreachPage() {
  const [activities, setActivities] = useState<(OutreachActivity & { companies?: { name: string } | null; contacts?: { first_name: string; last_name: string } | null })[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [trackFilter, setTrackFilter] = useState('all')

  const fetchActivities = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('outreach_activities')
      .select('*, companies(name), contacts(first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (typeFilter !== 'all') q = q.eq('type', typeFilter)
    if (statusFilter !== 'all') q = q.eq('status', statusFilter)
    if (trackFilter !== 'all') q = q.eq('track', trackFilter)
    const { data } = await q
    setActivities(data || [])
    setLoading(false)
  }, [typeFilter, statusFilter, trackFilter])

  useEffect(() => { fetchActivities() }, [fetchActivities])

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('outreach_activities').update({ status }).eq('id', id)
    fetchActivities()
  }

  const stats = {
    total: activities.length,
    sent: activities.filter(a => a.status === 'sent').length,
    replied: activities.filter(a => a.status === 'replied').length,
    followUpDue: activities.filter(a => a.follow_up_date && new Date(a.follow_up_date) <= new Date()).length,
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Outreach</h1>
        <p className="text-muted-foreground text-sm mt-1">All outreach activity across Track A & B</p>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total },
          { label: 'Sent', value: stats.sent },
          { label: 'Replied', value: stats.replied },
          { label: 'Follow-up Due', value: stats.followUpDue, alert: stats.followUpDue > 0 },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${s.alert ? 'text-orange-500' : ''}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={trackFilter} onValueChange={(v) => v != null && setTrackFilter(v)}>
          <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Track" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tracks</SelectItem>
            <SelectItem value="A">Track A</SelectItem>
            <SelectItem value="B">Track B</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => v != null && setTypeFilter(v)}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {['email','call','meeting','content_drop','linkedin','proposal'].map(t => (
              <SelectItem key={t} value={t} className="capitalize">{t.replace('_',' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => v != null && setStatusFilter(v)}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.keys(STATUS_COLOR).map(s => (
              <SelectItem key={s} value={s} className="capitalize">{s.replace('_',' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Activity list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
          ) : activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No activity found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Subject</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Follow-Up</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activities.map((a) => {
                    const Icon = TYPE_ICON[a.type] || Mail
                    return (
                      <tr key={a.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{a.companies?.name || '—'}</p>
                            {a.contacts && (
                              <p className="text-xs text-muted-foreground">
                                {a.contacts.first_name} {a.contacts.last_name}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Icon className="w-3.5 h-3.5" />
                            <span className="capitalize">{a.type.replace('_', ' ')}</span>
                            {a.ai_generated && <Sparkles className="w-3 h-3 text-purple-500" />}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="truncate">{a.subject || '—'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_COLOR[a.status] || ''}`}>
                            {a.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {a.follow_up_date ? format(new Date(a.follow_up_date), 'MMM d') : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {format(new Date(a.created_at), 'MMM d')}
                        </td>
                        <td className="px-4 py-3">
                          <Select value={a.status} onValueChange={(v) => v != null && updateStatus(a.id, v)}>
                            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.keys(STATUS_COLOR).map(s => (
                                <SelectItem key={s} value={s} className="capitalize text-xs">{s.replace('_', ' ')}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
