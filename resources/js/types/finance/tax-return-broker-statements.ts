/**
 * Types for consolidated broker 1099 statements.
 * Covers Fidelity, E*TRADE/Morgan Stanley, Wealthfront, and similar brokerage tax packages.
 */

// ============================================================================
// 1099-B SUMMARY (by Form 8949 category)
// ============================================================================

/** Summary-level 1099-B entry per Form 8949 reporting box */
export interface Form1099BCategory {
  term: 'short' | 'long' | 'undetermined'
  /** Form 8949 box: A/B/C for short-term, D/E/F for long-term */
  form8949Box: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  description: string
  proceeds: number
  costBasis: number
  marketDiscount?: number | null
  /** Wash sale loss disallowed (positive amount) */
  washSaleLossDisallowed?: number | null
  /** Net gain or (loss): proceeds − cost + wash sale disallowed [Form 8949 col h] */
  netGainLoss: number
}

// ============================================================================
// FOREIGN INCOME SUMMARY (per security / country)
// ============================================================================

/** Per-security foreign income and withholding tax entry */
export interface ForeignIncomeSummaryEntry {
  securityDescription: string
  cusip?: string | null
  country?: string | null
  ordinaryDividends?: number | null
  qualifiedDividends?: number | null
  interest?: number | null
  totalIncome: number
  foreignTaxPaid: number
}

// ============================================================================
// SUPPLEMENTAL INFO (not reported to IRS)
// ============================================================================

/** Non-reportable fees and expenses from broker supplemental schedules */
export interface BrokerSupplementalInfo {
  marginInterest?: number | null
  accountFees?: number | null
  managementFees?: number | null
  /** Payments in lieu of dividends charged on short positions */
  shortDividends?: number | null
  interestPaidOnShortPosition?: number | null
  /** Per-security foreign income and withholding detail */
  foreignIncomeSummary?: ForeignIncomeSummaryEntry[]
  totalForeignIncome?: number | null
  totalForeignTax?: number | null
}

// ============================================================================
// CONSOLIDATED BROKER 1099 STATEMENT
// ============================================================================

/** Consolidated broker 1099 tax statement (one entry per brokerage account) */
export interface BrokerConsolidated1099Statement {
  payerName: string
  payerTin: string
  accountNumber: string
  taxYear: number
  statementDate?: string | null
  /** Total pages in original statement (informational) */
  statementPages?: number | null

  /** 1099-DIV reported amounts */
  dividends?: {
    box1a_ordinary?: number | null
    box1b_qualified?: number | null
    box2a_totalCapGain?: number | null
    box2b_unrecapturedSec1250?: number | null
    box2c_section1202?: number | null
    box2d_collectibles28?: number | null
    box2e_section897Ordinary?: number | null
    box2f_section897CapGain?: number | null
    box3_nondividend?: number | null
    box4_federalTaxWithheld?: number | null
    box5_section199A?: number | null
    box6_investmentExpense?: number | null
    box7_foreignTaxPaid?: number | null
    box8_foreignCountry?: string | null
    box11_exemptInterest?: number | null
    box12_privateActivityBond?: number | null
  }

  /** 1099-INT reported amounts */
  interest?: {
    box1_interest?: number | null
    box2_earlyWithdrawal?: number | null
    box3_savingsBonds?: number | null
    box4_federalTaxWithheld?: number | null
    box5_investmentExpense?: number | null
    box6_foreignTaxPaid?: number | null
    box8_taxExempt?: number | null
    box9_privateActivity?: number | null
  }

  /** 1099-MISC reported amounts */
  miscIncome?: {
    box3_otherIncome?: number | null
    box4_federalTaxWithheld?: number | null
    box8_substitutePayments?: number | null
  }

  /** 1099-B summary entries by Form 8949 category */
  capitalGains?: Form1099BCategory[]

  /** Supplemental data (not reported to IRS) */
  supplemental?: BrokerSupplementalInfo
}
