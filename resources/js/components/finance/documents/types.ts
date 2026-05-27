export interface FinanceDocumentAccount {
  id: number
  account_id: number | null
  document_id: number
  statement_id: number | null
  form_type: string | null
  tax_year: number | null
  account_section_label: string | null
  payload_kind: string | null
  ai_identifier: string | null
  ai_account_name: string | null
  is_reviewed: boolean
  account?: {
    acct_id: number
    acct_name: string
    acct_number?: string | null
  } | null
}

export interface FinanceDocument {
  id: number
  document_kind: string
  tax_year: number | null
  period_start: string | null
  period_end: string | null
  original_filename: string | null
  mime_type: string | null
  file_size_bytes: number | null
  human_file_size: string | null
  genai_status: string | null
  is_reviewed: boolean
  download_count: number
  created_at: string
  updated_at: string | null
  accounts: FinanceDocumentAccount[]
  tax_document?: {
    id: number
    document_id: number
    form_type: string
    tax_year: number
    is_reviewed: boolean
    genai_status: string | null
  } | null
  capabilities: string[]
}

export interface FinanceDocumentDetail extends FinanceDocument {
  stored_filename: string | null
  genai_job_id: number | null
  parsed_data_needs_review: boolean
  parsed_data_warnings: string[] | null
  notes: string | null
  statements: Array<{
    id: number
    acct_id: number | null
    statement_closing_date: string | null
    closing_balance: number | null
  }>
  lot_summary: {
    count: number
  }
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
    from: number | null
    to: number | null
  }
  links: {
    first: string | null
    last: string | null
    prev: string | null
    next: string | null
  }
}

export interface DocumentSummary {
  by_kind: Record<string, number>
  by_year: Record<string, number>
  by_status: Record<string, number>
  missing_account_count: number
  total: number
}

export interface DocumentImpactPreviewData {
  summary: {
    document_id: number
    account_links: number
    statements: number
    lots: number
    has_tax_document: boolean
  }
  impact_hash: string
}

export type DocumentCapability =
  | 'view_original'
  | 'download_original'
  | 'delete'
  | 'reprocess'
  | 'review_parsed_data'
  | 'resolve_accounts'
  | 'open_statement'
  | 'open_tax_document'
  | 'open_lot_workspace'
  | 'open_tax_reconciliation'
  | 'rollback_import'
  | 'reimport_statement'

export const KIND_LABELS: Record<string, string> = {
  tax_form: 'Tax form',
  statement: 'Statement',
  csv_import: 'CSV import',
  json_import: 'JSON import',
  toon_import: 'TOON import',
  manual: 'Manual',
}

export const KIND_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'tax_form', label: 'Tax Forms' },
  { value: 'statement', label: 'Statements' },
  { value: 'csv_import', label: 'CSV' },
  { value: 'json_import', label: 'JSON' },
  { value: 'toon_import', label: 'TOON' },
  { value: 'manual', label: 'Manual' },
] as const
