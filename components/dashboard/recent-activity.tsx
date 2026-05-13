import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { Mail, Phone, Users, FileText, Link2, Presentation } from 'lucide-react'

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  call: Phone,
  meeting: Users,
  content_drop: FileText,
  linkedin: Link2,
  proposal: Presentation,
}

const TYPE_COLOR: Record<string, string> = {
  email: 'bg-blue-100 text-blue-700',
  call: 'bg-green-100 text-green-700',
  meeting: 'bg-purple-100 text-purple-700',
  content_drop: 'bg-orange-100 text-orange-700',
  linkedin: 'bg-sky-100 text-sky-700',
  proposal: 'bg-pink-100 text-pink-700',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RecentActivity({ activities }: { activities: any[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
      <CardContent className="p-0">
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 px-4">No activity logged yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {activities.map((a) => {
              const Icon = TYPE_ICON[a.type] || Mail
              return (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={`mt-0.5 p-1.5 rounded-md ${TYPE_COLOR[a.type] || 'bg-muted text-muted-foreground'}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {a.companies?.name || 'Unknown Company'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{a.subject || a.type}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline" className="text-[10px] capitalize">{a.status}</Badge>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
