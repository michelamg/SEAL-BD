import type { SignalType, Confidence } from '@/lib/scoring'

// A normalized signal as emitted by any source connector. Sources are blind to
// each other; the registry corroborates across them (D10).
export interface RawSignal {
  type: SignalType
  summary: string
  observed_at?: string | null // ISO date the underlying event happened
  source: string
  source_url?: string
  confidence: Confidence
  corroboration_count?: number
}

export interface SourceCompany {
  name: string
  website?: string | null
}

// The contract every source plugs into. Add a new source by implementing this
// and registering it — nothing else in the pipeline changes (D10).
export interface LeadSource {
  name: string
  enabled: boolean
  fetchSignals(company: SourceCompany): Promise<RawSignal[]>
}
