import type { ParsedDataWarning, TaxDocument, TaxDocumentAccountLink } from '@/types/finance/tax-document'

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
  notes?: string | null
  misc_routing?: string | null
  reporting_mode?: string | null
  parsed_data_needs_review?: boolean
  parsed_data_warnings?: ParsedDataWarning[] | string[] | null
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
  parsed_data_needs_review?: boolean
  parsed_data_warnings?: string[] | ParsedDataWarning[] | null
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

export interface DocumentSourceJob {
  id: number
  status?: string | null
  job_type?: string | null
  ai_provider?: string | null
  ai_model?: string | null
  original_filename?: string | null
  parsed_at?: string | null
}

export interface FinanceDocumentStatement {
  id: number
  acct_id: number | null
  statement_closing_date: string | null
  closing_balance: number | string | null
  imported_transactions_count?: number
  imported_lots_count?: number
  account?: {
    acct_id: number
    acct_name: string
    acct_number?: string | null
  } | null
  source_job?: DocumentSourceJob | null
}

export interface FinanceDocumentStatementFacet {
  document_id: number
  period: {
    start: string | null
    end: string | null
  }
  linked_accounts: Array<FinanceDocumentAccount | { account_id: number | null; account?: FinanceDocumentAccount['account'] | null }>
  balance_snapshots_count: number
  imported_transactions_count: number
  imported_lots_count: number
  parsed_data_needs_review: boolean
  parsed_data_warnings: string[] | ParsedDataWarning[] | null
  source_job: DocumentSourceJob | null
  statements: FinanceDocumentStatement[]
}

export interface FinanceDocumentLotSummaryFacet {
  count: number
  counts_by_source?: Record<string, number>
  counts_by_reconciliation_state?: Record<string, number>
  workspace_url?: string
}

export interface FinanceDocumentTaxFacet {
  document_id: number
  tax_document_id: number
  form_type: string
  tax_year: number
  review_status: 'reviewed' | 'needs_review' | 'unreviewed'
  parsing_status: string | null
  is_reviewed: boolean
  parsed_data_summary: {
    has_parsed_data: boolean
    is_multi_entry: boolean
    entry_count: number
    top_level_keys: string[]
    warnings_count: number
    needs_review: boolean
  }
  account_links: TaxDocumentAccountLink[]
  downstream_effects: {
    linked_lots_count: number
    reconciliation_link_counts_by_state: Record<string, number>
  }
  review_document: TaxDocument
}

export interface FinanceDocumentDetail extends FinanceDocument {
  stored_filename: string | null
  genai_job_id: number | null
  parsed_data_needs_review: boolean
  parsed_data_warnings: string[] | ParsedDataWarning[] | null
  notes: string | null
  statements: FinanceDocumentStatement[]
  statement_facet: FinanceDocumentStatementFacet | null
  tax_facet: FinanceDocumentTaxFacet | null
  lot_summary: FinanceDocumentLotSummaryFacet
  lot_summary_facet: FinanceDocumentLotSummaryFacet
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
    statement_details: number
    statement_cash_reports: number
    statement_nav: number
    statement_performance: number
    statement_positions: number
    statement_securities_lent: number
    transactions: number
    lots: number
    has_tax_document: boolean
    form1116_overrides: number
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

export interface DocumentFilterState {
  tax_year: string
  account_id: string
  form_type: string
  genai_status: string
  is_reviewed: string
  missing_account: string
  has_tax_document: string
  has_statement: string
  has_lots: string
  processing_status: string
  source_job_id: string
  sort: string
}

export const DEFAULT_DOCUMENT_FILTERS: DocumentFilterState = {
  tax_year: '',
  account_id: '',
  form_type: '',
  genai_status: '',
  is_reviewed: '',
  missing_account: '',
  has_tax_document: '',
  has_statement: '',
  has_lots: '',
  processing_status: '',
  source_job_id: '',
  sort: 'default',
}
