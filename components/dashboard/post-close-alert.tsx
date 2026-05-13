import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function PostCloseAlert({ checkins }: { checkins: any[] }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border border-orange-200 bg-orange-50 text-orange-900">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-orange-500" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {checkins.length} post-close check-in{checkins.length > 1 ? 's' : ''} due
        </p>
        <p className="text-xs text-orange-700 mt-0.5">
          {checkins.slice(0, 3).map((c) => c.companies?.name).join(', ')}
          {checkins.length > 3 && ` +${checkins.length - 3} more`}
        </p>
      </div>
      <Link href="/follow-up" className="text-xs font-medium underline shrink-0">
        View all
      </Link>
    </div>
  )
}
