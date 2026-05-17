export interface User {
  id: number
  name: string
  email: string
  user_role?: string
  last_login_date?: string | null
}

export interface ClientInvoice {
  client_invoice_id: number
  invoice_number: string
  invoice_total: string | number
  issue_date: string | null
  due_date: string | null
  status: 'draft' | 'issued' | 'paid' | 'void'
  remaining_balance: number
}

export interface ClientCompany {
  id: number
  company_name: string
  slug: string | null
  address?: string | null
  website?: string | null
  phone_number?: string | null
  default_hourly_rate?: string | null
  additional_notes?: string | null
  is_active?: boolean
  stripe_billing_enabled?: boolean
  last_activity?: string | null
  created_at: string
  users: User[]
  agreements: Agreement[]
  total_balance_due?: number
  uninvoiced_hours?: number
  uninvoiced_task_total?: number
  uninvoiced_task_complete_total?: number
  uninvoiced_task_incomplete_total?: number
  lifetime_value?: number
  unpaid_invoices?: ClientInvoice[]
  current_billing_cadence?: 'monthly' | 'quarterly' | 'annual' | null
  current_retainer_hours?: number | null
  current_cycle_progress?: number | null
  needs_attention?: boolean
  activities?: ClientCompanyActivity[]
}

export interface Project {
  id: number
  name: string
  slug: string
  description?: string | null
  tasks_count?: number
  time_entries_count?: number
  created_at?: string
}

export interface Task {
  id: number
  name: string
  description?: string | null
  priority?: number
  completion_date?: string | null
  assignee_user_id?: number | null
  is_hidden?: boolean
  creator_user_id?: number | null
  created_at?: string
  updated_at?: string
  assignee?: User | null
  creator?: User | null
  project?: Project | null
}

export interface Agreement {
  id: number
  client_company_id?: number
  active_date: string
  termination_date: string | null
  agreement_text?: string | null
  agreement_link?: string | null
  client_company_signed_date: string | null
  client_company_signed_user_id?: number | null
  client_company_signed_name?: string | null
  client_company_signed_title?: string | null
  is_visible_to_client?: boolean
  monthly_retainer_hours: string
  catch_up_threshold_hours?: string
  rollover_months?: number
  hourly_rate?: string
  monthly_retainer_fee: string
  billing_cadence?: 'monthly' | 'quarterly' | 'annual'
  bill_overage_interim?: boolean
  first_cycle_proration?: 'prorate_hours' | 'full_period' | 'align_next_cycle'
  initial_rollover_hours?: string
  recurring_items?: ClientAgreementRecurringItem[]
}

export interface ClientAgreementRecurringItem {
  id: number
  client_agreement_id: number
  description: string
  amount: string
  charge_cadence: 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'one_time'
  anchor_month: number | null
  anchor_day: number | null
  start_date: string
  end_date: string | null
  is_taxable: boolean
  is_summarized: boolean
  notes: string | null
}

export interface ClientCompanyActivity {
  id: number
  client_company_id: number
  actor_user_id: number | null
  actor_name: string | null
  action: string
  subject_type: string | null
  subject_id: number | null
  payload: Record<string, unknown>
  created_at: string | null
}
