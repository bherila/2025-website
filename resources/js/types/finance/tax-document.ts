/** Shared types for tax document components and API responses. */

/** Parsed field values from W-2: all box values. */
export interface W2ParsedData {
  employer_name?: string | null
  employer_ein?: string | null
  employee_name?: string | null
  employee_ssn_last4?: string | null
  box1_wages?: number | null
  box2_fed_tax?: number | null
  box3_ss_wages?: number | null
  box4_ss_tax?: number | null
  box5_medicare_wages?: number | null
  box6_medicare_tax?: number | null
  box7_ss_tips?: number | null
  box8_allocated_tips?: number | null
  box10_dependent_care?: number | null
  box11_nonqualified?: number | null
  box12_codes?: Array<{ code: string; amount: number }>
  box13_statutory?: boolean | null
  box13_retirement?: boolean | null
  box13_sick_pay?: boolean | null
  box14_other?: Array<{ label: string; amount: number }>
  box15_state?: string | null
  box16_state_wages?: number | null
  box17_state_tax?: number | null
  box18_local_wages?: number | null
  box19_local_tax?: number | null
  box20_locality?: string | null
}

/** Parsed field values from 1099-INT. */
export interface F1099IntParsedData {
  payer_name?: string | null
  payer_tin?: string | null
  recipient_name?: string | null
  recipient_tin_last4?: string | null
  box1_interest?: number | null
  box2_early_withdrawal?: number | null
  box3_savings_bond?: number | null
  box4_fed_tax?: number | null
  box5_investment_expense?: number | null
  box6_foreign_tax?: number | null
  box7_foreign_country?: string | null
  box8_tax_exempt?: number | null
  box9_private_activity?: number | null
  box10_market_discount?: number | null
  box11_bond_premium?: number | null
  box12_treasury_premium?: number | null
  box13_tax_exempt_premium?: number | null
  account_number?: string | null
}

/** Parsed field values from 1099-DIV. */
export interface F1099DivParsedData {
  payer_name?: string | null
  payer_tin?: string | null
  recipient_name?: string | null
  recipient_tin_last4?: string | null
  box1a_ordinary?: number | null
  box1b_qualified?: number | null
  box2a_cap_gain?: number | null
  box2b_unrecap_1250?: number | null
  box2c_section_1202?: number | null
  box2d_collectibles?: number | null
  box2e_section_897_ordinary?: number | null
  box2f_section_897_cap_gain?: number | null
  box3_nondividend?: number | null
  box4_fed_tax?: number | null
  box5_section_199a?: number | null
  box6_investment_expense?: number | null
  box7_foreign_tax?: number | null
  box8_foreign_country?: string | null
  box9_cash_liquidation?: number | null
  box10_noncash_liquidation?: number | null
  box11_exempt_interest?: number | null
  box12_private_activity?: number | null
  box13_state?: string | null
  box14_state_tax?: number | null
  account_number?: string | null
}

/** Parsed field values from 1099-MISC. */
export interface F1099MiscParsedData {
  payer_name?: string | null
  payer_tin?: string | null
  recipient_name?: string | null
  recipient_tin_last4?: string | null
  account_number?: string | null
  box1_rents?: number | null
  box2_royalties?: number | null
  box3_other_income?: number | null
  box4_fed_tax?: number | null
  box5_fishing_boat?: number | null
  box6_medical?: number | null
  box7_direct_sales_indicator?: boolean | null
  box8_substitute_payments?: number | null
  box9_crop_insurance?: number | null
  box10_gross_proceeds_attorney?: number | null
  box11_fish_purchased?: number | null
  box12_section_409a_deferrals?: number | null
  box13_fatca_filing?: string | null
  box14_excess_golden_parachute?: number | null
  box15_nonqualified_deferred?: number | null
  box15_state?: string | null
  box16_state_tax?: number | null
}

/** Union of all possible parsed_data shapes. */
export type TaxDocumentParsedData = W2ParsedData | F1099IntParsedData | F1099DivParsedData | F1099MiscParsedData

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
  parsed_data: TaxDocumentParsedData | null
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
  '1099_misc': '1099-MISC',
}

export const W2_FORM_TYPES = ['w2', 'w2c'] as const
export const ACCOUNT_FORM_TYPES_1099 = ['1099_int', '1099_div', '1099_misc'] as const
