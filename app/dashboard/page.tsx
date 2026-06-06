import { createClient } from '@/lib/supabase/server'
import { StatsRow } from '@/components/dashboard/stats-row'
import { PipelineChart } from '@/components/dashboard/pipeline-chart'
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { UpcomingTouches } from '@/components/dashboard/upcoming-touches'
import { PostCloseAlert } from '@/components/dashboard/post-close-alert'

export const dynamic = 'force-dynamic'

async function getDashboardData() {
  // Server Component: use the request-scoped session client so RLS applies as
  // the signed-in user. (The browser `supabase` singleton has no session here.)
  const supabase = await createClient()
  const [
    { count: totalProspects },
    { count: activeCompanies },
    { count: activeListings },
    { count: followUpsDue },
    { data: recentActivities },
    { data: upcomingCadences },
    { data: postCloseDue },
    { data: companiesByVertical },
  ] = await Promise.all([
    supabase.from('companies').select('*', { count: 'exact', head: true }).eq('track', 'A'),
    supabase.from('companies').select('*', { count: 'exact', head: true }).eq('stage', 'active'),
    supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('cadences').select('*', { count: 'exact', head: true }).eq('status', 'pending').lte('next_touch_date', new Date().toISOString().split('T')[0]),
    supabase.from('outreach_activities').select('*, companies(name), contacts(first_name, last_name)').order('created_at', { ascending: false }).limit(8),
    supabase.from('cadences').select('*, companies(name), listings(name)').eq('status', 'pending').order('next_touch_date').limit(6),
    supabase.from('post_close_checkins').select('*, companies(name)').eq('status', 'pending').lte('scheduled_date', new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]).limit(5),
    supabase.from('companies').select('vertical').not('vertical', 'is', null),
  ])

  const verticalCounts = (companiesByVertical || []).reduce<Record<string, number>>((acc, c) => {
    if (c.vertical) acc[c.vertical] = (acc[c.vertical] || 0) + 1
    return acc
  }, {})

  return {
    totalProspects: totalProspects || 0,
    activeCompanies: activeCompanies || 0,
    activeListings: activeListings || 0,
    followUpsDue: followUpsDue || 0,
    recentActivities: recentActivities || [],
    upcomingCadences: upcomingCadences || [],
    postCloseDue: postCloseDue || [],
    verticalCounts,
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Seal Team BD Pipeline Overview</p>
      </div>

      <StatsRow
        totalProspects={data.totalProspects}
        activeCompanies={data.activeCompanies}
        activeListings={data.activeListings}
        followUpsDue={data.followUpsDue}
      />

      {data.postCloseDue.length > 0 && <PostCloseAlert checkins={data.postCloseDue} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <PipelineChart verticalCounts={data.verticalCounts} />
          <RecentActivity activities={data.recentActivities} />
        </div>
        <div>
          <UpcomingTouches cadences={data.upcomingCadences} />
        </div>
      </div>
    </div>
  )
}
