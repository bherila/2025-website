export interface ClientAgreement {
  id: number
  client_company_id?: number
  active_date: string
  termination_date: string | null
  agreement_text: string | null
  agreement_link: string | null
  client_company_signed_date: string | null
  client_company_signed_user_id?: number | null
  client_company_signed_name: string | null
  client_company_signed_title: string | null
  monthly_retainer_hours: string
  catch_up_threshold_hours: string
  rollover_months: number
  hourly_rate: string
  monthly_retainer_fee: string
  is_visible_to_client?: boolean
  billing_cadence: 'monthly' | 'quarterly' | 'annual'
  bill_overage_interim: boolean
  first_cycle_proration: 'prorate_hours' | 'full_period' | 'align_next_cycle'
  recurring_items?: ClientAgreementRecurringItem[]
  client_company?: {
    id: number
    company_name: string
    slug: string | null
  }
  signed_by_user?: {
    id?: number
    name: string
    email: string
  }
}

export type BillingCadence = 'monthly' | 'quarterly' | 'annual'
export type ChargeCadence = 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'one_time'
export type FirstCycleProration = 'prorate_hours' | 'full_period' | 'align_next_cycle'

export interface ClientAgreementRecurringItem {
  id: number
  client_agreement_id: number
  description: string
  amount: string
  charge_cadence: ChargeCadence
  anchor_month: number | null
  anchor_day: number | null
  start_date: string
  end_date: string | null
  is_taxable: boolean
  is_summarized: boolean
  notes: string | null
}