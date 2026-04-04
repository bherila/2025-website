/** Shared types for tax document components and API responses. */

export interface TaxDocument {
  id: number
  user_id: number
  tax_year: number
  form_type: string
  employment_entity_id: number | null
  account_id: number | null
  original_filename: string
  stored_filename: string
  s3_path: string
  mime_type: string
  file_size_bytes: number
  file_hash: string
  is_reconciled: boolean
  is_confirmed: boolean
  notes: string | null
  human_file_size: string
  download_count: number
  genai_job_id: number | null
  genai_status: 'pending' | 'processing' | 'parsed' | 'failed' | null
  parsed_data: Record<string, string | number | null> | null
  uploader: { id: number; name: string } | null
  employment_entity: { id: number; display_name: string } | null
  account: { acct_id: number; acct_name: string } | null
  created_at: string
  updated_at: string
}

export interface EmploymentEntity {
  id: number
  display_name: string
  type: string
  is_hidden: boolean
}

export const FORM_TYPE_LABELS: Record<string, string> = {
  w2: 'W-2',
  w2c: 'W-2c',
  '1099_int': '1099-INT',
  '1099_int_c': '1099-INT-C',
  '1099_div': '1099-DIV',
  '1099_div_c': '1099-DIV-C',
}

export const W2_FORM_TYPES = ['w2', 'w2c'] as const
export const ACCOUNT_FORM_TYPES_1099 = ['1099_int', '1099_int_c', '1099_div', '1099_div_c'] as const
