import type { User, Project, Task } from './common'

export interface TimeEntry {
  id: number
  name: string | null
  minutes_worked: number
  formatted_time: string
  date_worked: string
  is_billable: boolean
  is_invoiced: boolean
  job_type: string
  user: User | null
  project: Project | null
  task: Task | null
  created_at: string
}

export interface MonthlyOpeningBalance {
  retainer_hours: number
  rollover_hours: number
  expired_hours: number
  total_available: number
  negative_offset: number
  invoiced_negative_balance?: number
}

export interface MonthlyClosingBalance {
  unused_hours: number
  excess_hours: number
  hours_used_from_retainer: number
  hours_used_from_rollover: number
  remaining_rollover: number
  negative_balance?: number
}

export interface MonthlyData {
  year_month: string
  has_agreement: boolean
  entries_count: number
  hours_worked: number
  formatted_hours: string
  retainer_hours?: number
  rollover_months?: number
  opening: MonthlyOpeningBalance | null
  closing: MonthlyClosingBalance | null
  unbilled_hours?: number // Billable hours with no active agreement (delayed billing)
  pre_agreement_hours_applied?: number
  will_be_billed_in_next_agreement?: boolean
}

export interface TimeEntriesResponse {
  entries: TimeEntry[]
  monthly_data: MonthlyData[]
  total_time: string
  total_minutes: number
  billable_time: string
  billable_minutes: number
  total_unbilled_hours?: number // Total hours to be billed against future agreements
}