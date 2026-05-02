export type GenAiJobType =
  | 'finance_transactions'
  | 'finance_payslip'
  | 'utility_bill'
  | 'tax_document'
  | 'tax_form_multi_account_import'

export type GenAiJobStatus =
  | 'pending'
  | 'processing'
  | 'parsed'
  | 'imported'
  | 'failed'
  | 'queued_tomorrow'

export type GenAiResultStatus = 'pending_review' | 'imported' | 'skipped'

export interface GenAiImportResultData {
  id: number
  job_id: number
  result_index: number
  result_json: string
  status: GenAiResultStatus
  imported_at: string | null
  created_at: string
  updated_at: string
}

export interface GenAiImportJobData {
  id: number
  user_id: number
  ai_configuration_id: number | null
  ai_provider: string | null
  ai_model: string | null
  acct_id: number | null
  job_type: GenAiJobType
  file_hash: string
  original_filename: string
  s3_path: string
  mime_type: string | null
  file_size_bytes: number
  context_json: string | null
  status: GenAiJobStatus
  error_message: string | null
  raw_response: string | null
  retry_count: number
  scheduled_for: string | null
  parsed_at: string | null
  input_tokens: number | null
  output_tokens: number | null
  created_at: string
  updated_at: string
  results?: GenAiImportResultData[]
}
