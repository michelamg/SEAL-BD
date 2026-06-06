// ─────────────────────────────────────────────────────────────────────────────
// Deterministic lead-audit scoring engine.
//
// This is the core of the qualification layer the platform lacked. Every point a
// lead earns traces to an explicit rule and the signals that triggered it (D4),
// trigger signals lose weight as they age (D9), and signals confirmed by more
// than one independent source score higher and are flagged multi-source
// verified (D10). The score is fully deterministic — the LLM never produces or
// adjusts it; it is only allowed to narrate the verified signals afterwards.
//
// Pure and side-effect-free: pass `asOf` so callers (and tests) control "now".
// No database, network, or env access — unit-testable in isolation.
// ─────────────────────────────────────────────────────────────────────────────

import type { Vertical } from '@/types'

export type SignalType =
  | 'funding'
  | 'hiring'
  | 'leadership'
  | 'lease'
  | 'expansion'
  | 'gov_contract'
  | 'filing'
  | 'other'

export type Confidence = 'verified' | 'estimated' | 'unverified'

export interface SignalInput {
  type: SignalType
  /** ISO date the underlying event actually happened — drives freshness decay. */
  observed_at?: string | null
  confidence?: Confidence
  /** Number of independent sources confirming this signal (>=2 ⇒ corroborated). */
  corroboration_count?: number
  source?: string
  source_url?: string
  summary?: string
}

export interface ContactInput {
  is_c_suite?: boolean
  email?: string | null
  phone?: string | null
}

export interface CompanyInput {
  vertical?: Vertical | null
  employee_count?: number | null
  size?: string | null
  estimated_sf?: number | null
  current_lease_expiration?: string | null
  lease_clock_confidence?: Confidence
  contacts?: ContactInput[]
  /** The team's focus verticals; a match scores full vertical-fit. */
  target_verticals?: Vertical[]
}

export interface FactorScore {
  key: string
  label: string
  points: number
  max: number
  /** Plain-English explanation of how the points were earned — the audit trail. */
  rationale: string
  /** Sources backing this factor, deduped. */
  sources: string[]
}

export type ScoreBand = 'hot' | 'warm' | 'cool' | 'cold'

export interface LeaseRead {
  read: string
  confidence: Confidence
  monthsToExpiry: number | null
}

export interface Scorecard {
  score: number // 0–100
  band: ScoreBand
  factors: FactorScore[]
  /** Count of signals confirmed by 2+ independent sources (D10). */
  corroboratedSignals: number
  lease: LeaseRead
  recommendedAction: string
}

// ─── Tunable configuration (extracted from brokers in working sessions) ────────

/** Factor weights sum to 100. */
export const FACTOR_MAX = {
  signals: 35,
  lease: 20,
  vertical: 15,
  size: 12,
  reachability: 10,
  footprint: 8,
} as const

/** Days over which each signal type decays from full weight to zero (D9). */
export const FRESHNESS_WINDOWS: Record<SignalType, number> = {
  funding: 180, // fresh < 2wk full, ~3mo (90d) half, ~6mo (180d) ≈ zero
  hiring: 365, // rolling — slow decay
  leadership: 240,
  lease: 0, // n/a — handled by the lease factor, not freshness
  expansion: 365,
  gov_contract: 540,
  filing: 180,
  other: 180,
}

/** Intrinsic strength of each signal type (0–1) before decay/confidence/corroboration. */
export const SIGNAL_BASE_STRENGTH: Record<SignalType, number> = {
  funding: 1.0,
  gov_contract: 0.9,
  expansion: 0.85,
  lease: 0.8,
  filing: 0.7,
  leadership: 0.6,
  hiring: 0.5,
  other: 0.3,
}

const CONFIDENCE_MULT: Record<Confidence, number> = {
  verified: 1.0,
  estimated: 0.7,
  unverified: 0.5,
}

/** Each unit of (strength × freshness × confidence × corroboration) ≈ this many points. */
const POINTS_PER_SIGNAL_UNIT = 20

const CORE_VERTICALS: Vertical[] = ['NIC', 'Tech', 'Life Sci', 'Defense', 'Pro Services']

const DAY_MS = 86_400_000

/** Recent signals stay at full weight for this grace window before decaying. */
const FRESHNESS_GRACE_DAYS = 14

// ─── Small pure helpers ────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function corroborationMultiplier(count: number | undefined): number {
  const c = count ?? 1
  if (c >= 3) return 1.3
  if (c === 2) return 1.2
  return 1.0
}

/** Freshness multiplier in [0,1]: linear decay over the type's window (D9). */
export function freshness(type: SignalType, observedAt: string | null | undefined, asOf: Date): number {
  const window = FRESHNESS_WINDOWS[type] ?? 180
  if (window <= 0) return 1
  if (!observedAt) return 0.4 // date unknown — can't confirm recency, partial credit only
  const observed = new Date(observedAt).getTime()
  if (Number.isNaN(observed) || Number.isNaN(asOf.getTime())) return 0.4
  const ageDays = (asOf.getTime() - observed) / DAY_MS
  // Implausibly future-dated (beyond the grace window) — a bad/forged source date
  // shouldn't keep a lead artificially hot. Treat as unconfirmable.
  if (ageDays < -FRESHNESS_GRACE_DAYS) return 0.4
  if (ageDays <= FRESHNESS_GRACE_DAYS) return 1 // genuinely fresh → full weight
  return clamp(1 - (ageDays - FRESHNESS_GRACE_DAYS) / (window - FRESHNESS_GRACE_DAYS), 0, 1)
}

/** Months from `asOf` until the lease expires (negative if already expired). */
export function monthsUntil(dateStr: string | null | undefined, asOf: Date): number | null {
  if (!dateStr) return null
  const t = new Date(dateStr).getTime()
  if (Number.isNaN(t)) return null
  return (t - asOf.getTime()) / DAY_MS / 30.44
}

// ─── Individual factors ──────────────────────────────────────────────────────

function scoreSignals(signals: SignalInput[], asOf: Date): { factor: FactorScore; corroborated: number } {
  const max = FACTOR_MAX.signals
  // Lease signals are scored by the lease factor, not here — exclude them so a
  // lease signal isn't double-counted.
  const scored = signals.filter((s) => s.type !== 'lease')
  let unitSum = 0
  let corroborated = 0
  const sources = new Set<string>()
  const parts: string[] = []

  for (const s of scored) {
    const base = SIGNAL_BASE_STRENGTH[s.type] ?? SIGNAL_BASE_STRENGTH.other
    const fresh = freshness(s.type, s.observed_at, asOf)
    const conf = CONFIDENCE_MULT[s.confidence ?? 'unverified'] ?? CONFIDENCE_MULT.unverified
    const corr = corroborationMultiplier(s.corroboration_count)
    if ((s.corroboration_count ?? 1) >= 2) corroborated++
    const unit = base * fresh * conf * corr
    unitSum += unit
    if (s.source) sources.add(s.source)
    parts.push(
      `${s.type} (${Math.round(fresh * 100)}% fresh, ${s.confidence ?? 'unverified'}` +
        `${(s.corroboration_count ?? 1) >= 2 ? `, ×${s.corroboration_count} sources` : ''})`,
    )
  }

  const points = clamp(Math.round(unitSum * POINTS_PER_SIGNAL_UNIT), 0, max)
  const rationale =
    scored.length === 0
      ? 'No (non-lease) trigger signals on file.'
      : `${scored.length} signal${scored.length > 1 ? 's' : ''}, recency- and source-weighted: ${parts.join('; ')}.`

  return { factor: { key: 'signals', label: 'Trigger signals', points, max, rationale, sources: [...sources] }, corroborated }
}

function scoreLease(company: CompanyInput, signals: SignalInput[], asOf: Date): { factor: FactorScore; lease: LeaseRead } {
  const max = FACTOR_MAX.lease
  const months = monthsUntil(company.current_lease_expiration, asOf)
  // Lease data is best-effort and ALWAYS flagged unless an authoritative source
  // verified it (D3). We never fabricate a date.
  const confidence: Confidence = company.lease_clock_confidence ?? 'unverified'
  const sources: string[] = []
  const leaseSignal = signals.find((s) => s.type === 'lease')
  if (leaseSignal?.source) sources.push(leaseSignal.source)

  let points = 0
  let read: string

  if (months === null) {
    points = leaseSignal ? 6 : 4
    read = leaseSignal
      ? 'Lease activity detected but no expiration date confirmed — estimate before outreach.'
      : 'No lease-timing data — unknown.'
  } else if (months < 0) {
    points = 6
    read = `Lease appears to have expired ~${Math.abs(Math.round(months))}mo ago — likely already re-committed.`
  } else if (months <= 3) {
    points = 8
    read = `~${Math.round(months)}mo to expiry — likely too late to influence this cycle.`
  } else if (months <= 18) {
    points = max // 6–18 months out is the CRE outreach sweet spot
    read = `~${Math.round(months)}mo to expiry — inside the active outreach window.`
  } else if (months <= 24) {
    points = 12
    read = `~${Math.round(months)}mo to expiry — approaching the window; begin warming.`
  } else {
    points = 6
    read = `~${Math.round(months)}mo to expiry — early; hold for re-warming.`
  }

  const flagged = confidence !== 'verified'
  const rationale =
    (months === null
      ? read
      : `${read} (${confidence}${flagged ? ' — confirm before outreach' : ''})`) +
    (flagged ? ' Flagged: lease timing is a best-effort estimate, not verified.' : '')

  return {
    factor: { key: 'lease', label: 'Lease timing', points, max, rationale, sources },
    lease: { read, confidence, monthsToExpiry: months === null ? null : Math.round(months) },
  }
}

function scoreVertical(company: CompanyInput): FactorScore {
  const max = FACTOR_MAX.vertical
  const v = company.vertical
  const targets = company.target_verticals?.length ? company.target_verticals : CORE_VERTICALS
  let points: number
  let rationale: string
  if (v && targets.includes(v)) {
    points = max
    rationale = `${v} is a target vertical for the team.`
  } else if (v && CORE_VERTICALS.includes(v)) {
    points = 10
    rationale = `${v} is a core vertical (not on the current focus list).`
  } else if (v && v !== 'Other') {
    points = 6
    rationale = `${v} is a recognized vertical but outside the core focus.`
  } else {
    points = 4
    rationale = 'Vertical unclassified or "Other".'
  }
  return { key: 'vertical', label: 'Vertical fit', points, max, rationale, sources: [] }
}

function scoreSize(company: CompanyInput): FactorScore {
  const max = FACTOR_MAX.size
  const n = company.employee_count ?? parseSizeBand(company.size)
  let points: number
  let rationale: string
  if (n == null) {
    points = 4
    rationale = 'Headcount unknown.'
  } else if (n >= 50 && n <= 1500) {
    points = max
    rationale = `~${n} employees — squarely in the CRE sweet spot.`
  } else if (n > 1500 && n <= 5000) {
    points = 9
    rationale = `~${n} employees — large; longer cycle but real footprint.`
  } else if (n >= 20 && n < 50) {
    points = 8
    rationale = `~${n} employees — emerging; watch for growth.`
  } else if (n > 5000) {
    points = 7
    rationale = `~${n} employees — enterprise; likely incumbent broker.`
  } else {
    points = 3
    rationale = `~${n} employees — likely too small for a meaningful requirement.`
  }
  return { key: 'size', label: 'Company size fit', points, max, rationale, sources: [] }
}

function scoreReachability(company: CompanyInput): FactorScore {
  const max = FACTOR_MAX.reachability
  const contacts = company.contacts ?? []
  const csuiteEmail = contacts.some((c) => c.is_c_suite && !!c.email)
  const anyEmail = contacts.some((c) => !!c.email)
  const anyContact = contacts.length > 0
  let points: number
  let rationale: string
  if (csuiteEmail) {
    points = max
    rationale = 'Decision-maker on file with a direct email.'
  } else if (anyEmail) {
    points = 6
    rationale = 'Reachable contact on file, but no verified decision-maker email.'
  } else if (anyContact) {
    points = 3
    rationale = `${contacts.length} contact(s) on file, no email channel yet.`
  } else {
    points = 0
    rationale = 'No contacts — decision-makers must be enriched before outreach.'
  }
  return { key: 'reachability', label: 'Reachability', points, max, rationale, sources: [] }
}

function scoreFootprint(company: CompanyInput): FactorScore {
  const max = FACTOR_MAX.footprint
  const sf = company.estimated_sf ?? null
  let points: number
  let rationale: string
  if (sf == null) {
    points = 2
    rationale = 'Estimated space need unknown.'
  } else if (sf >= 25_000) {
    points = max
    rationale = `~${sf.toLocaleString()} SF — substantial requirement.`
  } else if (sf >= 10_000) {
    points = 6
    rationale = `~${sf.toLocaleString()} SF — solid mid-size requirement.`
  } else if (sf >= 5_000) {
    points = 4
    rationale = `~${sf.toLocaleString()} SF — modest requirement.`
  } else {
    points = 2
    rationale = `~${sf.toLocaleString()} SF — small requirement.`
  }
  return { key: 'footprint', label: 'Footprint', points, max, rationale, sources: [] }
}

// "201-500" → 350 (midpoint), "1000+" → 1500, etc.
function parseSizeBand(size: string | null | undefined): number | null {
  if (!size) return null
  const plus = size.match(/(\d+)\s*\+/)
  if (plus) return Math.round(Number(plus[1]) * 1.5)
  const range = size.match(/(\d+)\s*[-–]\s*(\d+)/)
  if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2)
  const single = size.match(/(\d+)/)
  return single ? Number(single[1]) : null
}

function bandFor(score: number): ScoreBand {
  if (score >= 70) return 'hot'
  if (score >= 50) return 'warm'
  if (score >= 30) return 'cool'
  return 'cold'
}

function recommend(band: ScoreBand, lease: LeaseRead, reachability: number): string {
  const reachable = reachability >= 6
  switch (band) {
    case 'hot':
      return reachable
        ? 'Reach out now — assign to a broker and open the sequence.'
        : 'High-fit — enrich decision-makers, then open outreach immediately.'
    case 'warm':
      return lease.monthsToExpiry != null && lease.monthsToExpiry > 18
        ? 'Add to nurture cadence; re-evaluate as the lease window approaches.'
        : 'Add to nurture cadence and warm with relevant content.'
    case 'cool':
      return 'Defer — keep in the database; re-surface on a fresh signal or lease-window change.'
    default:
      return 'Hold in the database; no action until a new signal lands.'
  }
}

// ─── Public entry point ──────────────────────────────────────────────────────

export function scoreLead(company: CompanyInput, signals: SignalInput[] = [], asOf: Date = new Date()): Scorecard {
  const { factor: signalFactor, corroborated } = scoreSignals(signals, asOf)
  const { factor: leaseFactor, lease } = scoreLease(company, signals, asOf)
  const factors: FactorScore[] = [
    signalFactor,
    leaseFactor,
    scoreVertical(company),
    scoreSize(company),
    scoreReachability(company),
    scoreFootprint(company),
  ]
  const score = clamp(
    factors.reduce((sum, f) => sum + f.points, 0),
    0,
    100,
  )
  const band = bandFor(score)
  const reachability = factors.find((f) => f.key === 'reachability')?.points ?? 0
  return {
    score,
    band,
    factors,
    corroboratedSignals: corroborated,
    lease,
    recommendedAction: recommend(band, lease, reachability),
  }
}
