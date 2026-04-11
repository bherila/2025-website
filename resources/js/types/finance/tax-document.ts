/** Shared types for tax document components and API responses. */

export type { FK1StructuredData } from '@/types/finance/k1-data'
export { isFK1StructuredData } from '@/types/finance/k1-data'
export type {
  CapitalAssetTransaction,
  CompleteTaxReturn,
  Form1040,
  Form1040Credits,
  Form1040Filing,
  Form1040Income,
  Form1116,
  Form1116IncomeCategory,
  Form4952,
  Form6781,
  Form8582,
  Form8829,
  Form8949,
  Form8959,
  Form8959PartI,
  Form8959PartII,
  Form8960,
  Form8960PartI,
  Form8960PartII,
  Form8995A,
  PartnershipIncome,
  PassiveActivityLoss,
  Schedule1,
  Schedule1PartI,
  Schedule1PartII,
  Schedule2,
  Schedule2PartI,
  Schedule2PartII,
  Schedule3,
  Schedule3NonrefundableCredits,
  Schedule3RefundableCredits,
  ScheduleA,
  ScheduleAInterestPaid,
  ScheduleAMedicalAndDental,
  ScheduleATaxesPaid,
  ScheduleB,
  ScheduleBInterestIncome,
  ScheduleBOrdinaryDividends,
  ScheduleC,
  ScheduleCBusiness,
  ScheduleCExpenseItem,
  ScheduleCExpenses,
  ScheduleCIncome,
  ScheduleD,
  ScheduleE,
  Section1256Contract,
} from '@/types/finance/tax-return-forms'
export type {
  K1AdditionalInfoWorksheet,
  K1Box11OtherIncome,
  K1Box13OtherDeductions,
  K1Box19Distributions,
  K1Box20OtherInformation,
  K1PartnerInfo,
  K1PartnershipInfo,
  K1PassiveActivityWorksheet,
  K1QBIDeductionInfo,
  K1QBIStatementAInfo,
  K1ScheduleEEntry,
  ScheduleK1Form1065,
  ScheduleK3ForeignTransactions,
} from '@/types/finance/tax-return-k1'
export type {
  CapitalLossCarryoverSmartWorksheet,
  CompareToUSAverages,
  DividendIncomeEntry,
  EstimatedTaxPaymentOptions,
  FederalCarryoverWorksheet,
  ForeignTaxCreditCarryoverEntry,
  ForeignTaxCreditComputationWorksheet,
  Form8582ModifiedAGIWorksheet,
  InterestIncomeEntry,
  PersonOnReturnWorksheet,
  SALTDeductionSmartWorksheet,
  ScheduleBSmartWorksheet,
  ScheduleCTwoYearComparison,
  ScheduleSEAdjustmentsWorksheet,
  TaxHistoryReport,
  TaxSummary,
} from '@/types/finance/tax-return-worksheets'

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

/** Parsed field values from 1099-NEC. */
export interface F1099NecParsedData {
  payer_name?: string | null
  payer_tin?: string | null
  recipient_name?: string | null
  recipient_tin_last4?: string | null
  account_number?: string | null
  box1_nonemployeeComp?: number | null
  box2_directSalesIndicator?: boolean | null
  box4_fed_tax?: number | null
  box5_state_tax?: number | null
  box6_state?: string | null
  box7_state_income?: number | null
}

/** Parsed field values from 1099-R: distributions from pensions, annuities, retirement plans. */
export interface Form1099RParsedData {
  payer_name?: string | null
  payer_tin?: string | null
  recipient_name?: string | null
  recipient_tin_last4?: string | null
  account_number?: string | null
  box1_gross_distribution?: number | null
  box2a_taxable_amount?: number | null
  box2b_taxable_not_determined?: boolean | null
  box2b_total_distribution?: boolean | null
  box3_capital_gain?: number | null
  box4_fed_tax?: number | null
  box5_employee_contributions?: number | null
  box6_net_unrealized_appreciation?: number | null
  /** Distribution code(s) — e.g. "G" for direct rollover */
  box7_distribution_code?: string | null
  box7_ira_sep_simple?: boolean | null
  box8_other?: number | null
  box9a_percentage?: number | null
  box9b_employee_contributions?: number | null
  box10_amount_allocable_irr?: number | null
  box11_first_year_roth?: number | null
  box12_fatca?: boolean | null
  box13_date_payment?: string | null
  box14_state_tax?: number | null
  box15_state?: string | null
  box16_state_distribution?: number | null
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
 * @deprecated Use FK1StructuredData (schemaVersion "2026.1") for new K-1 documents.
 *
 * Flat K-1 parsed data shape used before the structured format was introduced.
 * Kept for backward compatibility with existing stored documents.
 */
export interface FK1ParsedData {
  form_source?: string | null
  tax_year?: string | null
  entity_name?: string | null
  entity_ein?: string | null
  partner_name?: string | null
  partner_ssn_last4?: string | null
  partner_ownership_pct?: number | null
  partner_type?: string | null
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
  box14_self_employment_earnings?: number | null
  distributions?: number | null
  state?: string | null
  state_tax_withheld?: number | null
  supplemental_statements?: string | null
  [key: string]: unknown
}

import type { FK1StructuredData as _FK1StructuredData } from './k1-data'

/**
 * One individual transaction lot from a 1099-B section.
 * Extracted by the AI during broker_1099 / tax_form_multi_account_import processing
 * and stored in parsed_data[n].transactions for 1099_b entries.
 * These are upserted into fin_account_lots and fin_account_line_items automatically.
 */
export interface BrokerTransaction1099B {
  symbol: string | null
  description: string
  cusip: string | null
  quantity: number
  /** "YYYY-MM-DD" or "various" for aggregated lots */
  purchase_date: string
  sale_date: string
  proceeds: number
  cost_basis: number
  accrued_market_discount: number | null
  wash_sale_disallowed: number
  realized_gain_loss: number
  /** true = short-term, false = long-term, null = undetermined */
  is_short_term: boolean | null
  /** IRS Form 8949 box: A/B/C (short-term) or D/E/F (long-term) */
  form_8949_box: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | null
  is_covered: boolean
  additional_info: string | null
}

/** parsed_data shape for a 1099-B account_link entry from a consolidated broker import. */
export interface Broker1099BParsedData {
  payer_name: string | null
  payer_tin: string | null
  total_proceeds: number | null
  total_cost_basis: number | null
  total_wash_sale_disallowed: number | null
  total_realized_gain_loss: number | null
  transactions: BrokerTransaction1099B[]
}

/** Union of all possible parsed_data shapes. */
export type TaxDocumentParsedData = W2ParsedData | F1099IntParsedData | F1099DivParsedData | F1099MiscParsedData | F1099NecParsedData | Form1099RParsedData | FK1ParsedData | _FK1StructuredData | Broker1099BParsedData

/** One row from fin_tax_document_accounts — links a PDF to a specific account. */
export interface TaxDocumentAccountLink {
  id: number
  tax_document_id: number
  account_id: number | null
  form_type: string
  tax_year: number
  is_reviewed: boolean
  notes: string | null
  account: { acct_id: number; acct_name: string } | null
  created_at: string
  updated_at: string
}

export interface TaxDocument {
  id: number
  user_id: number
  tax_year: number
  form_type: string
  employment_entity_id: number | null
  /** @deprecated Legacy column. Use accountLinks for account associations. */
  account_id: number | null
  original_filename: string | null
  stored_filename: string | null
  s3_path: string | null
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
  /** @deprecated Legacy eager-load. Use accountLinks instead. */
  account: { acct_id: number; acct_name: string } | null
  /** Canonical account associations — one per account/form pair for this PDF. */
  account_links: TaxDocumentAccountLink[]
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
  '1099_nec': '1099-NEC',
  '1099_r': 'Form 1099-R',
  '1099_b': '1099-B',
  broker_1099: 'Broker 1099',
  k1: 'K-1 / K-3',
}

export const W2_FORM_TYPES = ['w2', 'w2c'] as const
export const ACCOUNT_FORM_TYPES_1099 = ['1099_int', '1099_div', '1099_misc', '1099_nec', '1099_r', '1099_b', 'broker_1099', 'k1'] as const

export type {
  BrokerConsolidated1099Statement,
  BrokerSupplementalInfo,
  ForeignIncomeSummaryEntry,
  Form1099BCategory,
} from '@/types/finance/tax-return-broker-statements'
