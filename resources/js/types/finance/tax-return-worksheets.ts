/**
 * TurboTax-generated worksheet types for a complete federal tax return.
 * These supplement the official IRS forms with computed/supporting data.
 */

// ============================================================================
// TAX SUMMARY (TurboTax one-page summary)
// ============================================================================

export interface TaxSummary {
  taxYear: number
  totalIncome: number
  adjustmentsToIncome: number
  adjustedGrossIncome: number
  itemizedOrStandardDeduction: number
  qualifiedBusinessIncomeDeduction: number
  taxableIncome: number
  tentativeTax: number
  additionalTaxes: number
  altMinimumTax: number
  totalCredits: number
  otherTaxes: number
  totalTax: number
  totalPayments: number
  estimatedTaxPenalty?: number | null
  amountOverpaid?: number | null
  refund?: number | null
  amountAppliedToEstimate?: number | null
  balanceDue?: number | null
}

// ============================================================================
// TAX HISTORY REPORT (5-year comparison)
// ============================================================================

export interface TaxHistoryReport {
  years: Array<{
    year: number
    filingStatus?: string | null
    totalIncome?: number | null
    adjustmentsToIncome?: number | null
    adjustedGrossIncome?: number | null
    taxExpense?: number | null
    interestExpense?: number | null
    contributions?: number | null
    miscDeductions?: number | null
    totalItemizedOrStandardDeduction?: number | null
    qbiDeduction?: number | null
    taxableIncome?: number | null
    tax?: number | null
    altMinimumTax?: number | null
    totalCredits?: number | null
    otherTaxes?: number | null
    payments?: number | null
    form2210Penalty?: number | null
    refund?: number | null
    effectiveTaxRate?: number | null
    taxBracket?: number | null
  }>
}

// ============================================================================
// FEDERAL CARRYOVER WORKSHEET
// ============================================================================

export interface FederalCarryoverWorksheet {
  taxYear: number
  /** From prior year return */
  priorYear?: {
    itemizedDeductions?: number | null
    adjustedGrossIncome?: number | null
    taxLiability?: number | null
    altMinimumTax?: number | null
    federalOverpaymentApplied?: number | null
  }
  /** Current year tax info (populated after return completion) */
  currentYear?: {
    filingStatus?: string | null
    numberOfExemptions?: number | null
    itemizedDeductions?: number | null
    adjustedGrossIncome?: number | null
    taxLiabilityForm2210?: number | null
    altMinimumTax?: number | null
  }
  /** Loss and expense carryovers (enter as positive amounts) */
  lossCarryovers?: {
    shortTermCapitalLoss_prior?: number | null
    shortTermCapitalLoss_current?: number | null
    amtShortTermCapitalLoss_prior?: number | null
    amtShortTermCapitalLoss_current?: number | null
    longTermCapitalLoss_prior?: number | null
    longTermCapitalLoss_current?: number | null
    amtLongTermCapitalLoss_prior?: number | null
    amtLongTermCapitalLoss_current?: number | null
    netOperatingLoss_prior?: number | null
    netOperatingLoss_current?: number | null
    investmentInterestDisallowed_prior?: number | null
    investmentInterestDisallowed_current?: number | null
  }
  /** QBI (Section 199A) carryovers */
  qbiCarryovers?: {
    qualifiedBusinessLossCarryforward_prior?: number | null
    qualifiedBusinessLossCarryforward_current?: number | null
    qualifiedPtpLossCarryforward_prior?: number | null
    qualifiedPtpLossCarryforward_current?: number | null
  }
}

// ============================================================================
// CAPITAL LOSS CARRYOVER SMART WORKSHEET (prior-year data)
// ============================================================================

export interface CapitalLossCarryoverSmartWorksheet {
  priorYearNetSTGainLoss?: number | null
  priorYearNetLTGainLoss?: number | null
  allowableNetCapitalLoss?: number | null
  priorYearTaxableIncome?: number | null
  priorYearAMTTaxableIncome?: number | null
}

// ============================================================================
// FORM 8582 MODIFIED AGI WORKSHEET
// ============================================================================

export interface Form8582ModifiedAGIWorksheet {
  wages?: number | null
  interestIncomeBefore?: number | null
  dividendIncome?: number | null
  taxRefund?: number | null
  alimonyReceived?: number | null
  nonpassiveBusinessIncomeLoss?: number | null
  royaltyAndNonpassiveRental?: number | null
  nonpassivePartnershipIncomeLoss?: number | null
  nonpassiveSCorpIncomeLoss?: number | null
  capitalGainsAndLosses?: number | null
  otherIncome?: number | null
  totalIncome?: number | null
  totalAdjustments?: number | null
  modifiedAGI?: number | null
}

// ============================================================================
// SCHEDULE SE ADJUSTMENTS WORKSHEET
// ============================================================================

export interface ScheduleSEAdjustmentsWorksheet {
  /** Part I: Farm */
  totalSchedulesF?: number | null
  /** Part II: Nonfarm */
  totalSchedulesC?: number | null
  totalForms6781?: number | null
  totalForScheduleSELine2?: number | null
}

// ============================================================================
// SCHEDULE B SMART WORKSHEET — PER-PAYER DETAIL
// ============================================================================

export interface InterestIncomeEntry {
  payerName: string
  box1_interestIncome?: number | null
  box2_earlyWithdrawalPenalty?: number | null
  box3_savingsBondTreasury?: number | null
  box8_taxExemptInterest?: number | null
  box9_privateActivityBond?: number | null
}

export interface DividendIncomeEntry {
  payerName: string
  box1a_ordinaryDividends?: number | null
  box1b_qualifiedDividends?: number | null
  box2a_capitalGainDistributions?: number | null
  box2b_unrecapturedSec1250?: number | null
  box3_nondividendDistributions?: number | null
  box12_exemptInterestDividends?: number | null
  stateId?: string | null
  privateActivityBond?: number | null
}

export interface ScheduleBSmartWorksheet {
  interestIncome: InterestIncomeEntry[]
  dividendIncome: DividendIncomeEntry[]
  totalTaxableInterest?: number | null
  totalOrdinaryDividends?: number | null
  totalQualifiedDividends?: number | null
  totalTaxExemptInterest?: number | null
}

// ============================================================================
// SCHEDULE A SMART WORKSHEETS
// ============================================================================

export interface SALTDeductionSmartWorksheet {
  /** Amount on Schedule A, line 5d (actual state/local taxes) */
  actualStateTaxes?: number | null
  form1040AGI?: number | null
  /** SALT cap ($10,000 for single) */
  saltCap?: number | null
  /** Phase-out computation (AGI × 30% for high-income filers) */
  phaseOutAGI?: number | null
  phaseOutMultiplier?: number | null
  phaseOutReduction?: number | null
  /** Deductible amount (lesser of cap and actual) */
  deductibleSALT?: number | null
}

// ============================================================================
// FOREIGN TAX CREDIT COMPUTATION WORKSHEET (Form 1116)
// ============================================================================

export interface ForeignTaxCreditCarryoverEntry {
  year: number
  foreignTaxes?: number | null
  section905cAdjustment?: number | null
  utilized?: number | null
  carryover?: number | null
}

export interface ForeignTaxCreditComputationWorksheet {
  copy: number
  incomeCategory: string
  residentCountry: string
  /** Part I – Taxable Income/Loss */
  grossIncomeFromScheduleB?: number | null
  grossIncomeFromK1Worksheets?: number | null
  grossIncomeTotal?: number | null
  allSourceGrossIncome?: number | null
  allocationRatio?: number | null
  investmentInterestAllocatedToForeign?: number | null
  /** Part II – Foreign Taxes Paid/Accrued */
  foreignTaxesPaid?: number | null
  foreignTaxesAccrued?: number | null
  /** Foreign tax credit carryovers */
  carryovers?: ForeignTaxCreditCarryoverEntry[]
  carryoverToNextYear?: number | null
  amtCarryoverToNextYear?: number | null
}

// ============================================================================
// ESTIMATED TAX PAYMENT OPTIONS
// ============================================================================

export interface EstimatedTaxPaymentOptions {
  taxYear: number
  /** Basis: 90%, 100%, or 110% of prior year */
  method: string
  totalEstimatedTaxes: number
  expectedWithholding: number
  taxesDueAfterWithholding: number
  estimatesAlreadyPaid?: number | null
  priorYearOverpaymentApplied?: number | null
  balanceDue: number
  quarterlyPayments: Array<{
    paymentNumber: number
    dueDate: string
    amount: number
  }>
}

// ============================================================================
// SCHEDULE C TWO-YEAR COMPARISON
// ============================================================================

export interface ScheduleCTwoYearComparison {
  businessDescription: string
  priorYear: number
  currentYear: number
  grossReceipts_prior?: number | null
  grossReceipts_current?: number | null
  returnsAllowances_prior?: number | null
  returnsAllowances_current?: number | null
  netReceipts_prior?: number | null
  netReceipts_current?: number | null
  totalExpenses_prior?: number | null
  totalExpenses_current?: number | null
  officeInHome_prior?: number | null
  officeInHome_current?: number | null
  tentativeProfit_prior?: number | null
  tentativeProfit_current?: number | null
  netProfit_prior?: number | null
  netProfit_current?: number | null
}

// ============================================================================
// PERSON ON RETURN WORKSHEET
// ============================================================================

export interface PersonOnReturnWorksheet {
  firstName: string
  lastName: string
  suffix?: string | null
  dateOfBirth?: string | null
  stateOfResidence?: string | null
  ssn: string
  isDeceased?: boolean
  isStudent?: boolean
  hasEducationExpenses?: boolean
}

// ============================================================================
// COMPARE TO U.S. AVERAGES
// ============================================================================

export interface CompareToUSAverages {
  taxYear: number
  yourAGI: number
  nationalAGIRangeLow: number
  nationalAGIRangeHigh: number
  selectedItems: Array<{
    description: string
    yourAmount?: number | null
    nationalAverage?: number | null
  }>
}
