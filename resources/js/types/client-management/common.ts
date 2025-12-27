export interface User {
  id: number
  name: string
  email: string
  user_role?: string
  last_login_date?: string | null
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
  last_activity?: string | null
  created_at: string
  users: User[]
  agreements: Agreement[]
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
  active_date: string
  termination_date: string | null
  client_company_signed_date: string | null
  is_visible_to_client: boolean
  monthly_retainer_hours: string
  monthly_retainer_fee: string
}