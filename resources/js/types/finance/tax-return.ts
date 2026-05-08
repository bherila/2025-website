import type { Broker1099BReportingMode } from '@/types/finance/tax-document'

export type { EstimatedTaxPaymentsData } from '@/lib/finance/estimatedTaxPayments'

// These interfaces duplicate the ones exported from the component files.
// They live here (in types/) so that the domain type layer does not depend on the UI layer.
// The component files re-export these for backward-compatibility.

export interface Form1040LineItem {
  line: string
  label: string
  value: number | null
  bold?: boolean
  refSchedule?: string
  sources?: { label: string; amount: number; note?: string }[]
  navTab?: string
}

export interface UserDeductionEntry {
  id: number
  category: string
  description: string | null
  amount: number
}

export interface ScheduleALines {
  invIntSources: { label: string; amount: number }[]
  totalInvIntExpense: number
  /** Raw SALT paid before the cap: selected line 5a income/sales tax plus real estate tax. */
  saltPaid: number
  /** SALT paid capped at the year-specific federal limit. */
  saltDeduction: number
  /** User-entered mortgage interest. */
  mortgageInterest: number
  /** User-entered charitable contributions (cash + non-cash). */
  charitable: number
  /** Other user-entered deductions. */
  otherDeductions: number
  /** K-1 Box 13L (portfolio deduction, no 2% floor) sources flowing to Sch A Line 16. */
  otherItemizedSources: { label: string; amount: number }[]
  /** Sum of otherItemizedSources (K-1 Box 13L) — included in totalItemizedDeductions. */
  totalOtherItemized: number
  /** All user-entered deduction entries for the inline UI. */
  userDeductions: UserDeductionEntry[]
  /** Total itemized deductions (investment interest + SALT + mortgage + charitable + other). */
  totalItemizedDeductions: number
  /** Standard deduction for the year and filing status. */
  standardDeduction: number
  /** True when itemized > standard. */
  shouldItemize: boolean
}

export interface ScheduleCNetIncome {
  total: number
  byQuarter: { q1: number; q2: number; q3: number; q4: number }
}

export interface Form1116Lines {
  incomeSources: { label: string; amount: number }[]
  taxSources: { label: string; amount: number }[]
  totalPassiveIncome: number
  totalForeignTaxes: number
  generalIncomeSources: { label: string; amount: number }[]
  totalGeneralIncome: number
  line4bApportionment: { label: string; interestExpense: number; ratio: number; line4b: number }[]
  totalLine4b: number
  creditVsDeduction: { creditValue: number; deductionValue: number; recommendation: 'credit' } | null
  turboTaxAlert: boolean
  totalK1Box5?: number
  /** K-1 funds that have "Sourced by Partner" (col f) amounts in K-3 Part II, and whether the election to treat them as U.S. source is active. */
  sbpElections?: { docId: number; partnerName: string; active: boolean; sourcedByPartner: number }[]
}

interface Form6251SourceEntry {
  label: string
  code: string
  line: string
  amount: number
  description: string
  requiresStatementReview?: boolean
}

export interface Form6251Lines {
  line1TaxableIncome: number
  line2aTaxesOrStandardDeduction: number
  line2aSource: 'salt_deduction' | 'standard_deduction' | 'none'
  line2cInvestmentInterest: number
  line2dDepletion: number
  line2kDispositionOfProperty: number
  line2lPost1986Depreciation: number
  line2mPassiveActivities: number
  line2nLossLimitations: number
  line2tIntangibleDrillingCosts: number
  line3OtherAdjustments: number
  adjustmentTotal: number
  amti: number
  exemption: number
  exemptionBase: number
  exemptionReduction: number
  exemptionPhaseoutThreshold: number
  amtTaxBase: number
  amtRateSplitThreshold: number
  amtBeforeForeignCredit: number
  line8AmtForeignTaxCredit: number
  tentativeMinTax: number
  regularTax: number
  regularForeignTaxCredit: number
  regularTaxAfterCredits: number
  amt: number
  filingStatus: 'single' | 'mfj'
  sourceEntries: Form6251SourceEntry[]
  requiresStatementReview: boolean
  manualReviewReasons: string[]
}

export interface Doc1099ExportEntry {
  formType: string
  payerName: string
  parsedData: Record<string, unknown> | Record<string, unknown>[]
  accountId?: number | null
  accountName?: string | null
  accountLast4?: string | null
  accountLinks?: {
    id: number
    account_id: number | null
    form_type: string
    reporting_mode?: Broker1099BReportingMode | null
    ai_identifier: string | null
    ai_account_name: string | null
    account: { acct_id: number; acct_name: string; acct_number?: string | null } | null
  }[]
}

export interface Form8995Lines {
  entries: { label: string; qbiIncome: number; qbiLossNettingAdjustment: number; qbiAfterLossNetting: number; w2Wages: number; ubia: number; reitDividends: number; ptpIncome: number; isSstb: boolean; sectionNotes: string; qbiComponent: number }[]
  totalQBI: number
  totalQBIComponent: number
  totalIncome: number
  estimatedTaxableIncome: number
  stdDedApplied: number
  taxableIncomeCap: number
  estimatedDeduction: number
  aboveThreshold: boolean
  thresholdSingle: number
  thresholdMFJ: number
}

export interface Form8960Lines {
  taxableInterest: number
  ordinaryDividends: number
  netCapGains: number
  passiveIncome: number
  nonpassiveTradingIncome: number
  investmentInterestExpense: number
  grossNII: number
  totalDeductions: number
  netInvestmentIncome: number
  magi: number
  threshold: number
  magiExcess: number
  niitTax: number
  components: { label: string; amount: number; boxRef?: string }[]
  /** Per-payer interest sources for the data source modal. */
  interestSources: { label: string; amount: number }[]
  /** Per-payer dividend sources for the data source modal. */
  dividendSources: { label: string; amount: number }[]
  /** Per-K-1 passive income sources for the data source modal. */
  passiveSources: { label: string; amount: number }[]
}

export interface CapitalLossCarryoverLines {
  netShortTerm: number
  netLongTerm: number
  combined: number
  appliedToOrdinaryIncome: number
  shortTermCarryover: number
  longTermCarryover: number
  totalCarryover: number
  hasCarryover: boolean
}

export interface Form461Lines {
  /** Aggregate trade/business income (loss) after nonbusiness adjustments — Form 461 Line 14. */
  aggregateBusinessIncomeLoss: number
  /** EBL threshold for the year and filing status — Form 461 Line 15. */
  eblLimit: number
  /** Disallowed excess loss → NOL carryforward (Form 461 Line 16, 0 if not triggered). */
  excessBusinessLoss: number
  /** True when business losses exceed the EBL limit. */
  isTriggered: boolean
  /** Filing status used for the threshold lookup. */
  isMarried: boolean
  /** K-1 Box 20AJ disclosures used to audit §461(l) trader-business economics. */
  k1Disclosures?: {
    docId: number
    partnerName: string
    capitalGains: number
    capitalLosses: number
    otherIncome: number
    otherDeductions: number
    net: number
  }[]
}

export interface Form8582ActivityLine {
  activityName: string
  ein?: string | undefined
  /** True if this is rental real estate (K-1 Box 2) — eligible for $25k special allowance. */
  isRentalRealEstate: boolean
  /** True if the taxpayer actively participates in this rental activity. Required for $25k allowance. */
  activeParticipation: boolean
  /** Current-year income from this activity (positive). */
  currentIncome: number
  /** Current-year loss from this activity (negative). */
  currentLoss: number
  /** Prior-year unallowed losses carried forward (negative). */
  priorYearUnallowed: number
  /** Net result = income + loss + priorYearUnallowed. */
  overallGainOrLoss: number
  /** Portion of total allowed loss allocated to this activity (Worksheet 5 col c). */
  allowedLossThisYear: number
  /** Portion of suspended loss allocated to this activity (Worksheet 5 col d). */
  suspendedLossCarryforward: number
}

export interface Form8582Lines {
  /** Per-activity breakdown. */
  activities: Form8582ActivityLine[]
  /** Sum of all current-year passive income (positive). */
  totalPassiveIncome: number
  /** Sum of all current-year passive losses (negative). */
  totalPassiveLoss: number
  /** Sum of all prior-year unallowed losses (negative or zero). */
  totalPriorYearUnallowed: number
  /** Net passive result: income + loss + prior-year. Negative = net loss. */
  netPassiveResult: number
  /** $25k rental real estate special allowance (after MAGI phase-out). */
  rentalAllowance: number
  /**
   * Total gross passive losses that are deductible in aggregate this year.
   * When netPassiveResult >= 0, this equals the full gross loss amount (income covers all losses).
   * When limited, this = passive income + effective rental allowance.
   */
  totalAllowedLoss: number
  /** Total passive loss that is suspended (carried forward). */
  totalSuspendedLoss: number
  /**
   * Net deduction flowing to Schedule E / Form 1040.
   * When passive income covers all losses: 0 (net income, not a deduction).
   * When losses are limited: equals totalAllowedLoss (the deductible portion).
   */
  netDeductionToReturn: number
  /** True when some loss is suspended. */
  isLossLimited: boolean
  /** Modified AGI used for the $25k phase-out calculation. */
  magi: number
  /** Filing status. */
  isMarried: boolean
  /** True when taxpayer qualifies as a real estate professional (§469(c)(7)). */
  realEstateProfessional: boolean
}
