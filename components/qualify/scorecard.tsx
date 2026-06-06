'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Scorecard, SignalInput, ScoreBand } from '@/lib/scoring'
import {
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Check,
  Clock,
  X,
  Sparkles,
  Loader2,
  Mail,
  Phone,
} from 'lucide-react'

export type Decision = 'approved' | 'deferred' | 'disqualified'

export interface ContactRow {
  id?: string
  first_name?: string
  last_name?: string
  title?: string
  email?: string | null
  phone?: string | null
  is_c_suite?: boolean
}

const BAND_STYLE: Record<ScoreBand, { ring: string; text: string; pill: string; label: string }> = {
  hot: { ring: 'text-emerald-600', text: 'text-emerald-700', pill: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Hot' },
  warm: { ring: 'text-amber-600', text: 'text-amber-700', pill: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Warm' },
  cool: { ring: 'text-sky-600', text: 'text-sky-700', pill: 'bg-sky-100 text-sky-700 border-sky-200', label: 'Cool' },
  cold: { ring: 'text-muted-foreground', text: 'text-muted-foreground', pill: 'bg-muted text-muted-foreground border-border', label: 'Cold' },
}

const CONFIDENCE_BADGE: Record<string, string> = {
  verified: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  estimated: 'bg-amber-100 text-amber-700 border-amber-200',
  unverified: 'bg-amber-100 text-amber-700 border-amber-200',
}

export function Scorecard({
  company,
  scorecard,
  narrative,
  signals,
  contacts,
  loading,
  deciding,
  onRunAudit,
  onDecision,
}: {
  company: { name: string; vertical?: string | null; location?: string | null }
  scorecard: Scorecard | null
  narrative: string | null
  signals: SignalInput[]
  contacts: ContactRow[]
  loading: boolean
  deciding: boolean
  onRunAudit: () => void
  onDecision: (decision: Decision, reason?: string) => void
}) {
  const [reasonOpen, setReasonOpen] = useState<Decision | null>(null)
  const [reason, setReason] = useState('')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <div className="text-center space-y-3">
          <Loader2 className="w-7 h-7 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Auditing — scoring signals, lease timing, and fit…</p>
        </div>
      </div>
    )
  }

  if (!scorecard) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <div className="text-center space-y-3 max-w-sm">
          <ShieldCheck className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Run an audit to generate an evidence-backed scorecard for{' '}
            <span className="font-medium text-foreground">{company.name}</span>.
          </p>
          <Button onClick={onRunAudit} className="gap-2">
            <Sparkles className="w-4 h-4" /> Run Audit
          </Button>
        </div>
      </div>
    )
  }

  const band = BAND_STYLE[scorecard.band]
  const verified = signals.filter((s) => s.confidence === 'verified')
  const other = signals.filter((s) => s.confidence !== 'verified')

  const submitDecision = (decision: Decision) => {
    if (decision === 'disqualified' || decision === 'deferred') {
      if (reasonOpen === decision) {
        onDecision(decision, reason.trim() || undefined)
        setReasonOpen(null)
        setReason('')
      } else {
        setReasonOpen(decision)
      }
    } else {
      onDecision(decision)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header: identity + score */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{company.name}</h2>
          <p className="text-sm text-muted-foreground">
            {[company.vertical, company.location].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-4xl font-extrabold leading-none ${band.text}`}>{scorecard.score}</div>
          <span className={`inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${band.pill}`}>
            {band.label} · fit score
          </span>
        </div>
      </div>

      {/* Recommended action */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/80">Recommended action</p>
        <p className="text-sm font-medium mt-0.5">{scorecard.recommendedAction}</p>
      </div>

      {/* Why now — narrative + verified signals */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Why now — verified signals
          </p>
          {narrative && <p className="text-sm leading-relaxed">{narrative}</p>}

          {verified.length > 0 ? (
            <ul className="space-y-2">
              {verified.map((s, i) => (
                <SignalRow key={`v${i}`} s={s} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No independently verified signals yet — score reflects fit and best-effort timing only.
            </p>
          )}

          {other.length > 0 && (
            <ul className="space-y-2 pt-1 border-t border-border">
              {other.map((s, i) => (
                <SignalRow key={`o${i}`} s={s} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Lease timing (flagged) */}
      <Card>
        <CardContent className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Lease timing</p>
          <p className="text-sm mt-1">{scorecard.lease.read}</p>
          {scorecard.lease.confidence !== 'verified' && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              <AlertTriangle className="w-3.5 h-3.5" /> {scorecard.lease.confidence} — confirm before outreach
            </p>
          )}
        </CardContent>
      </Card>

      {/* Decision-makers */}
      <Card>
        <CardContent className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Decision-makers {contacts.length > 0 && `· ${contacts.length}`}
          </p>
          {contacts.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">None on file — enrich before outreach.</p>
          ) : (
            <ul className="space-y-1.5">
              {contacts.map((c, i) => (
                <li key={c.id ?? i} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="font-medium">{[c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown'}</span>
                    {c.title && <span className="text-muted-foreground"> · {c.title}</span>}
                    {c.is_c_suite && <Badge variant="outline" className="ml-2 text-[10px]">C-suite</Badge>}
                  </span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {c.email && <Mail className="w-3.5 h-3.5 text-emerald-600" aria-label="email on file" />}
                    {c.phone && <Phone className="w-3.5 h-3.5" aria-label="phone on file" />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Fit score — how it's built */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fit score — how it&apos;s built</p>
          {scorecard.factors.map((f) => (
            <div key={f.key}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{f.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {f.points}<span className="text-xs">/{f.max}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(f.points / f.max) * 100}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{f.rationale}</p>
              {f.sources.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {f.sources.map((src) => (
                    <span key={src} className="text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground">
                      {src}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {scorecard.corroboratedSignals > 0 && (
            <p className="text-xs text-emerald-700 flex items-center gap-1.5 pt-1">
              <Check className="w-3.5 h-3.5" /> {scorecard.corroboratedSignals} signal
              {scorecard.corroboratedSignals > 1 ? 's' : ''} multi-source verified
            </p>
          )}
        </CardContent>
      </Card>

      {/* Triage */}
      <div className="space-y-2 sticky bottom-0 bg-background pt-2 pb-1">
        {reasonOpen && (
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonOpen === 'disqualified' ? 'Reason for disqualifying (required)…' : 'Optional note…'}
            className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 min-h-16 resize-y"
          />
        )}
        <div className="flex gap-2">
          <Button
            className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            disabled={deciding}
            onClick={() => submitDecision('approved')}
          >
            <Check className="w-4 h-4" /> Approve
          </Button>
          <Button
            variant="outline"
            className="flex-1 gap-1.5"
            disabled={deciding}
            onClick={() => submitDecision('deferred')}
          >
            <Clock className="w-4 h-4" /> {reasonOpen === 'deferred' ? 'Confirm defer' : 'Defer'}
          </Button>
          <Button
            variant="outline"
            className="flex-1 gap-1.5 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
            disabled={deciding || (reasonOpen === 'disqualified' && !reason.trim())}
            onClick={() => submitDecision('disqualified')}
          >
            <X className="w-4 h-4" /> {reasonOpen === 'disqualified' ? 'Confirm disqualify' : 'Disqualify'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SignalRow({ s }: { s: SignalInput }) {
  const verified = s.confidence === 'verified'
  return (
    <li className="flex items-start gap-2 text-sm">
      {verified ? (
        <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
      )}
      <div className="min-w-0">
        <p className="truncate">{s.summary ?? s.type}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${CONFIDENCE_BADGE[s.confidence ?? 'unverified']}`}>
            {s.confidence ?? 'unverified'}
          </span>
          {s.source && <span>{s.source}</span>}
          {s.observed_at && <span>· {s.observed_at}</span>}
          {(s.corroboration_count ?? 1) >= 2 && <span className="text-emerald-700">· ×{s.corroboration_count} sources</span>}
          {s.source_url && (
            <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center hover:text-foreground">
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </p>
      </div>
    </li>
  )
}
