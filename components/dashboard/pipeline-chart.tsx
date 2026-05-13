'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#6b7280']

export function PipelineChart({ verticalCounts }: { verticalCounts: Record<string, number> }) {
  const data = Object.entries(verticalCounts).map(([name, value]) => ({ name, value }))

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Pipeline by Vertical</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">No pipeline data yet. Add companies to see breakdown.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Pipeline by Vertical</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
