import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format, isToday, isTomorrow, isPast } from 'date-fns'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function UpcomingTouches({ cadences }: { cadences: any[] }) {
  return (
    <Card className="h-full">
      <CardHeader><CardTitle className="text-base">Upcoming Touches</CardTitle></CardHeader>
      <CardContent className="p-0">
        {cadences.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 px-4">No touches scheduled.</p>
        ) : (
          <ul className="divide-y divide-border">
            {cadences.map((c) => {
              const date = new Date(c.next_touch_date)
              const overdue = isPast(date) && !isToday(date)
              const label = isToday(date) ? 'Today' : isTomorrow(date) ? 'Tomorrow' : format(date, 'MMM d')
              return (
                <li key={c.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {c.companies?.name || c.listings?.name || 'Unknown'}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">{c.touch_type?.replace('_', ' ')}</p>
                    </div>
                    <Badge
                      variant={overdue ? 'destructive' : 'outline'}
                      className="text-[10px] shrink-0"
                    >
                      {label}
                    </Badge>
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
