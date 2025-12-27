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
  rollover_months: number
  hourly_rate: string
  monthly_retainer_fee: string
  is_visible_to_client?: boolean
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