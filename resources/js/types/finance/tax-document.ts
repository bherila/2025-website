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

/**
 * Coded item used in K-1 for credits, AMT, foreign transactions, and other coded boxes.
 */
export interface K1CodedItem {
  code: string
  description?: string | null
  amount?: number | null
}

/**
 * Parsed field values from Schedule K-1 (Form 1065, 1120-S, or 1041).
 *
 * K-1 data is extensive and variable. All extracted data is stored in this flexible
 * object as JSON (via parsed_data). Fields not listed here may still be present.
 *
 * Future extension: box16_foreign_taxes_paid and box16_foreign_country will be used
 * when Form 1116 (Foreign Tax Credit) support is added. See GenAiJobDispatcherService
 * for details on the extension points.
 */
export interface FK1ParsedData {
  form_source?: string | null           // "1065", "1120-S", "1041"
  tax_year?: string | null
  entity_name?: string | null
  entity_ein?: string | null
  partner_name?: string | null
  partner_ssn_last4?: string | null
  partner_ownership_pct?: number | null
  partner_type?: string | null

  // Main income/deduction boxes
  box1_ordinary_income?: number | null
  box2_net_rental_real_estate?: number | null
  box3_other_net_rental?: number | null
  box4_guaranteed_payments_services?: number | null
  box5_guaranteed_payments_capital?: number | null
  box6_guaranteed_payments_total?: number | null
  box7_net_section_1231_gain?: number | null
  box8_other_income?: number | null
  box9_section_179_deduction?: number | null
  box10_other_deductions?: number | null
  box11_section_179_s_corp?: number | null

  // Self-employment
  box14_self_employment_earnings?: number | null

  // Coded arrays
  credits?: K1CodedItem[] | null
  amt_items?: K1CodedItem[] | null
  other_info_items?: K1CodedItem[] | null
  other_coded_items?: K1CodedItem[] | null

  // Foreign transactions (future Form 1116 extension)
  box16_foreign_taxes_paid?: number | null
  box16_foreign_country?: string | null
  box16_foreign_income_category?: string | null

  // Distributions
  distributions?: number | null

  // State
  state?: string | null
  state_tax_withheld?: number | null

  // Supplemental statement text
  supplemental_statements?: string | null

  // Allow any additional fields from AI extraction
  [key: string]: unknown
}

/** Union of all possible parsed_data shapes. */
export type TaxDocumentParsedData = W2ParsedData | F1099IntParsedData | F1099DivParsedData | F1099MiscParsedData | FK1ParsedData

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
  is_reviewed: boolean
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
  k1: 'K-1 / K-3',
}

export const W2_FORM_TYPES = ['w2', 'w2c'] as const
export const ACCOUNT_FORM_TYPES_1099 = ['1099_int', '1099_div', '1099_misc', 'k1'] as const
