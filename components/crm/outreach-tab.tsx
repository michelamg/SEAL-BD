'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { OutreachActivity } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { Plus, Sparkles } from 'lucide-react'
import { OutreachDialog } from './outreach-dialog'

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  opened: 'bg-purple-100 text-purple-700',
  replied: 'bg-green-100 text-green-700',
  no_response: 'bg-yellow-100 text-yellow-700',
  bounced: 'bg-red-100 text-red-700',
}

export function OutreachTab({ companyId }: { companyId: string }) {
  const [activities, setActivities] = useState<OutreachActivity[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)

  const fetchActivities = async () => {
    const { data } = await supabase
      .from('outreach_activities')
      .select('*, contacts(first_name, last_name)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    setActivities(data || [])
  }

  useEffect(() => { fetchActivities() }, [companyId])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{activities.length} activities</p>
        <Button size="sm" className="gap-1" onClick={() => setDialogOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Log / Draft
        </Button>
      </div>

      <ul className="space-y-2">
        {activities.map((a) => (
          <li key={a.id} className="border border-border rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded capitalize ${STATUS_COLOR[a.status] || ''}`}>{a.status}</span>
                  <span className="text-xs text-muted-foreground capitalize">{a.type.replace('_', ' ')}</span>
                  {a.ai_generated && (
                    <span className="text-xs text-purple-600 flex items-center gap-0.5">
                      <Sparkles className="w-3 h-3" />AI
                    </span>
                  )}
                </div>
                {a.subject && <p className="text-sm font-medium truncate">{a.subject}</p>}
                {a.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.body}</p>}
                {a.follow_up_date && (
                  <p className="text-xs text-orange-600 mt-1">Follow up: {format(new Date(a.follow_up_date), 'MMM d, yyyy')}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {format(new Date(a.created_at), 'MMM d')}
              </span>
            </div>
          </li>
        ))}
        {activities.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No outreach logged yet.</p>
        )}
      </ul>

      <OutreachDialog open={dialogOpen} onOpenChange={setDialogOpen} companyId={companyId} onSaved={fetchActivities} />
    </div>
  )
}
