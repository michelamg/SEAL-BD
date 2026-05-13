export type Vertical = 'NIC' | 'Tech' | 'Life Sci' | 'Defense' | 'Pro Services' | 'Other'
export type Track = 'A' | 'B' | 'both'
export type CompanyStage = 'prospect' | 'qualifying' | 'active' | 'nurturing' | 'won' | 'lost' | 'disqualified'
export type ListingStatus = 'active' | 'under_negotiation' | 'closed' | 'off_market'
export type ProspectStatus = 'identified' | 'contacted' | 'touring' | 'negotiating' | 'closed' | 'dead'
export type ActivityType = 'email' | 'call' | 'meeting' | 'content_drop' | 'linkedin' | 'proposal'
export type ActivityStatus = 'draft' | 'sent' | 'opened' | 'replied' | 'no_response' | 'bounced'
export type DealType = 'tenant_rep' | 'global_advisory' | 'listing'
export type CheckinType = '30_day' | '60_day' | '90_day'

export interface Company {
  id: string
  name: string
  website?: string
  industry?: string
  vertical?: Vertical
  size?: string
  employee_count?: number
  location?: string
  city?: string
  state?: string
  description?: string
  track: Track
  stage: CompanyStage
  estimated_sf?: number
  priority: 'high' | 'medium' | 'low'
  trigger_signal?: string
  source?: string
  source_id?: string
  apollo_id?: string
  zoominfo_id?: string
  notes?: string
  owner?: string
  created_at: string
  updated_at: string
  contacts?: Contact[]
  _count?: { contacts: number; activities: number }
}

export interface Contact {
  id: string
  company_id: string
  first_name: string
  last_name: string
  title?: string
  email?: string
  phone?: string
  linkedin_url?: string
  is_c_suite: boolean
  source?: string
  apollo_id?: string
  notes?: string
  created_at: string
  updated_at: string
  company?: Company
}

export interface Listing {
  id: string
  name: string
  address?: string
  city?: string
  state?: string
  submarket?: string
  size_sf?: number
  min_sf?: number
  max_sf?: number
  asking_rate?: number
  lease_type?: string
  available_date?: string
  status: ListingStatus
  target_verticals?: Vertical[]
  description?: string
  client_name?: string
  amenities?: string[]
  highlights?: string[]
  image_url?: string
  notes?: string
  created_at: string
  updated_at: string
  prospect_count?: number
}

export interface ListingProspect {
  id: string
  listing_id: string
  company_id: string
  status: ProspectStatus
  interest_signals?: string
  sf_needed?: number
  notes?: string
  created_at: string
  updated_at: string
  company?: Company
  listing?: Listing
}

export interface OutreachActivity {
  id: string
  company_id: string
  contact_id?: string
  listing_id?: string
  track: Track
  type: ActivityType
  subject?: string
  body?: string
  status: ActivityStatus
  sent_at?: string
  follow_up_date?: string
  ai_generated: boolean
  notes?: string
  created_by?: string
  created_at: string
  company?: Company
  contact?: Contact
  listing?: Listing
}

export interface Cadence {
  id: string
  company_id: string
  listing_id?: string
  track: Track
  touch_number: number
  next_touch_date: string
  touch_type: ActivityType
  status: 'pending' | 'completed' | 'skipped'
  notes?: string
  created_at: string
  company?: Company
  listing?: Listing
}

export interface PitchbookReport {
  id: string
  filename: string
  upload_date: string
  processed: boolean
  record_count: number
  new_companies: number
  updated_companies: number
  notes?: string
  created_at: string
  companies?: PitchbookCompany[]
}

export interface PitchbookCompany {
  id: string
  report_id: string
  company_name?: string
  description?: string
  industry?: string
  website?: string
  hq_location?: string
  employee_count?: string
  total_funding?: string
  last_funding_type?: string
  last_funding_date?: string
  last_funding_amount?: string
  investors?: string
  ceo_name?: string
  cfo_name?: string
  revenue?: string
  status: 'new' | 'imported' | 'skipped'
  matched_company_id?: string
  raw_data?: Record<string, unknown>
  created_at: string
}

export interface LeaseComp {
  id: string
  tenant_name?: string
  address?: string
  city?: string
  state?: string
  submarket?: string
  size_sf?: number
  rate_per_sf?: number
  lease_term?: string
  lease_type?: string
  deal_date?: string
  vertical?: Vertical
  notes?: string
  source?: string
  created_at: string
}

export interface Deal {
  id: string
  company_id: string
  listing_id?: string
  track: Track
  vertical?: Vertical
  lead_source?: string
  deal_type: DealType
  sf?: number
  commission_estimate?: number
  close_date?: string
  notes?: string
  created_at: string
  company?: Company
  listing?: Listing
}

export interface PostCloseCheckin {
  id: string
  deal_id: string
  company_id: string
  checkin_type: CheckinType
  scheduled_date: string
  completed_at?: string
  notes?: string
  status: 'pending' | 'completed' | 'skipped'
  created_at: string
  company?: Company
  deal?: Deal
}

export interface LeadFinderResult {
  company_name: string
  website?: string
  industry?: string
  location?: string
  employee_count?: string
  estimated_sf?: number
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  trigger_signal: string
  trigger_detail: string
  outreach_recommendation: string
  vertical_fit: Vertical
  source: string
  apollo_data?: Partial<Contact>[]
}

export interface DashboardStats {
  track_a: {
    total_prospects: number
    active: number
    won_this_quarter: number
    outreach_sent_this_week: number
    follow_ups_due: number
  }
  track_b: {
    active_listings: number
    total_prospects: number
    touring: number
    under_negotiation: number
  }
  pipeline_by_vertical: Record<Vertical, number>
  recent_activities: OutreachActivity[]
  upcoming_cadences: Cadence[]
  post_close_due: PostCloseCheckin[]
}
