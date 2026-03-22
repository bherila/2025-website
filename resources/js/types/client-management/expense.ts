import type { Project,User } from './common'

export interface ClientExpense {
  id: number
  client_company_id: number
  project_id: number | null
  fin_line_item_id: number | null
  description: string
  amount: number
  expense_date: string
  is_reimbursable: boolean
  is_reimbursed: boolean
  reimbursed_date: string | null
  category: string | null
  notes: string | null
  creator_user_id: number | null
  client_invoice_line_id: number | null
  created_at: string
  updated_at: string
  
  // Relationships (loaded conditionally)
  project?: Project | null
  creator?: User | null
  fin_line_item?: FinLineItemSummary | null
  client_company?: ClientCompanySummary | null
}

export interface FinLineItemSummary {
  t_id: number
  t_account: number
  t_date: string
  t_description: string | null
  t_amt: number
  account_name?: string
}

export interface ClientCompanySummary {
  id: number
  company_name: string
  slug: string
}

export interface ClientExpenseFormData {
  description: string
  amount: number | string
  expense_date: string
  project_id?: number | null
  fin_line_item_id?: number | null
  is_reimbursable: boolean
  is_reimbursed?: boolean
  reimbursed_date?: string | null
  category?: string | null
  notes?: string | null
}

export interface ExpensesResponse {
  expenses: ClientExpense[]
  total_amount: number
  reimbursable_total: number
  non_reimbursable_total: number
  pending_reimbursement_total: number
}
