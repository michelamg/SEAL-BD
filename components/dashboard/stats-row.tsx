import { Card, CardContent } from '@/components/ui/card'
import { Building2, Users, MapPin, Bell } from 'lucide-react'

export function StatsRow({
  totalProspects,
  activeCompanies,
  activeListings,
  followUpsDue,
}: {
  totalProspects: number
  activeCompanies: number
  activeListings: number
  followUpsDue: number
}) {
  const stats = [
    { label: 'Track A Prospects', value: totalProspects, icon: Users, color: 'text-blue-600' },
    { label: 'Active Accounts', value: activeCompanies, icon: Building2, color: 'text-green-600' },
    { label: 'Active Listings', value: activeListings, icon: MapPin, color: 'text-purple-600' },
    { label: 'Follow-Ups Due', value: followUpsDue, icon: Bell, color: followUpsDue > 0 ? 'text-red-500' : 'text-muted-foreground' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-muted ${s.color}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
