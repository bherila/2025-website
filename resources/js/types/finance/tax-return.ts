import type { ShortDividendSummary } from '@/lib/finance/shortDividendAnalysis'
import type { ScheduleDData } from '@/lib/tax/scheduleD'
import type { K3Section } from '@/types/finance/k1-data'

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
  /** Raw SALT paid before the $10,000 cap (W-2 Box 17 + user-entered SALT categories). */
  saltPaid: number
  /** SALT paid capped at $10,000. */
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

export interface ScheduleBSourceLine {
  label: string
  amount: number
  docId?: number
}

export interface ScheduleBLines {
  interestTotal: number
  dividendTotal: number
  qualifiedDivTotal: number
  interestLines: ScheduleBSourceLine[]
  dividendLines: ScheduleBSourceLine[]
  qualifiedDividendLines: ScheduleBSourceLine[]
}

export interface ScheduleCNetIncome {
  total: number
  byQuarter: { q1: number; q2: number; q3: number; q4: number }
}

export interface ScheduleELines {
  grandTotal: number
  totalPassive: number
  totalNonpassive: number
}

export interface Form4952Lines {
  invIntSources: { label: string; amount: number }[]
  totalInvIntExpense: number
  /** Box 20B investment expenses (Form 4952 Part II Line 5) — reduce NII. Separate from Part I interest. */
  invExpSources: { label: string; amount: number }[]
  totalInvExp: number
  niiBefore: number
  totalQualDiv: number
  deductibleInvestmentInterestExpense: number
  disallowedCarryforward: number
}

export interface ScheduleSELines {
  entries: { label: string; amount: number; sourceType: 'k1_box14_a' | 'k1_box14_c' | 'schedule_c' | 'schedule_f' }[]
  netEarningsFromSE: number
  seTaxableEarnings: number
  socialSecurityWageBase: number
  socialSecurityWages: number
  remainingSocialSecurityWageBase: number
  socialSecurityTaxableEarnings: number
  socialSecurityTax: number
  medicareWages: number
  medicareTaxableEarnings: number
  medicareTax: number
  additionalMedicareThreshold: number
  additionalMedicareTaxableEarnings: number
  additionalMedicareTax: number
  seTax: number
  deductibleSeTax: number
}

export interface Schedule1PartILines {
  line1a_taxableRefunds: number | null
  line2a_alimonyReceived: number | null
  line3_business: number
  line4_otherGains: number | null
  line5_rentalPartnerships: number
  line6_farmIncome: number | null
  line7_unemploymentCompensation: number | null
  line8b_gambling: number | null
  line8h_juryDuty: number | null
  line8i_prizes: number | null
  line8z_otherIncome: number
  line9_totalOther: number
  line10_total: number
}

export interface Schedule1PartIILines {
  line13_hsaDeduction: number | null
  line15_deductibleSeTax: number | null
  line17_selfEmployedHealthInsurance: number | null
  line20_iraDeduction: number | null
  line21_studentLoanInterest: number | null
  line26_totalAdjustments: number
}

export interface Schedule1Lines {
  partI: Schedule1PartILines
  partII: Schedule1PartIILines
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

export interface Form6251SourceEntry {
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

export interface K1ExportEntry {
  entityName: string
  ein?: string
  fields: Record<string, string | number>
  codes: Record<string, { code: string; value: string }[]>
  k3Sections?: K3Section[]
  /** Box 11 S — per-activity passive income/loss from supplemental statement (Form 8582). */
  passiveActivities?: import('@/types/finance/k1-data').K1PassiveActivity[]
}

export interface K3ExportEntry {
  entityName: string
  sections: K3Section[]
}

export interface Doc1099ExportEntry {
  formType: string
  payerName: string
  parsedData: Record<string, unknown>
}

export interface OverviewSection {
  heading: string
  rows: OverviewRow[]
}

export interface OverviewRow {
  item: string
  amount?: number | undefined
  note?: string | undefined
}

export interface Form8995Lines {
  entries: { label: string; qbiIncome: number; w2Wages: number; reitDividends: number; ptpIncome: number; isSstb: boolean; sectionNotes: string; qbiComponent: number }[]
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

export interface Form8959Lines {
  wages: number
  threshold: number
  excessWages: number
  additionalTax: number
  /** Per-W-2 document breakdown for the data source modal. */
  sources: { label: string; wages: number }[]
}

export interface Form8960Lines {
  taxableInterest: number
  ordinaryDividends: number
  netCapGains: number
  passiveIncome: number
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

export interface Schedule2Lines {
  /** Line 2 — Alternative Minimum Tax (Form 6251). 0 if not applicable. */
  altMinimumTax: number
  /** Line 4 — Self-employment tax (Schedule SE). */
  selfEmploymentTax: number
  /** Line 11 — Additional Medicare Tax (Form 8959). */
  additionalMedicareTax: number
  /** Line 12 — Net Investment Income Tax (Form 8960). */
  niit: number
  /** Line 21 total → Form 1040 Line 17. */
  totalAdditionalTaxes: number
}

export interface Form461Lines {
  /** Aggregate trade/business income (loss) — Form 461 Line 9. */
  aggregateBusinessIncomeLoss: number
  /** EBL threshold for the year and filing status — Form 461 Line 15. */
  eblLimit: number
  /** Disallowed excess loss → NOL carryforward (Form 461 Line 16, 0 if not triggered). */
  excessBusinessLoss: number
  /** True when business losses exceed the EBL limit. */
  isTriggered: boolean
  /** Filing status used for the threshold lookup. */
  isMarried: boolean
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

export interface Form4797Lines {
  partINet1231: number
  partIIOrdinary: number
  partIIIRecapture: number
  /** Net amount flowing to Schedule 1 line 4 (ordinary only). */
  netToSchedule1Line4: number
  /** Net §1231 gain flowing to Schedule D as long-term. */
  netToScheduleDLongTerm: number
  hasActivity: boolean
}

export interface ScheduleFLines {
  grossFarmIncome: number
  totalExpenses: number
  /** Line 34 — net farm profit or (loss) → Schedule 1 line 6. */
  netProfitOrLoss: number
  hasActivity: boolean
}

export interface Form8606Lines {
  line1_nondeductibleContributions: number
  line2_priorYearBasis: number
  line3_totalBasis: number
  line6_yearEndFmv: number
  line7_distributionsNotConverted: number
  line8_convertedToRoth: number
  line9_total: number
  line10_proRataRatio: number
  line11_basisInConversion: number
  line12_basisInDistributions: number
  line13_totalBasisUsed: number
  line14_basisCarriedForward: number
  line15c_taxableDistributions: number
  line18_taxableConversions: number
  /** Taxable amount flowing to Form 1040 line 4b (sum of line 15c + line 18). */
  taxableToForm1040Line4b: number
  /** Per-1099-R conversion rows. */
  conversions: { payerName: string; grossDistribution: number; taxableAmount: number; distributionCode: string; isIra: boolean }[]
  /** Per-1099-R non-conversion distribution rows. */
  distributions: { payerName: string; grossDistribution: number; taxableAmount: number; distributionCode: string; isIra: boolean }[]
  hasActivity: boolean
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

export interface TaxReturn1040 {
  year: number
  overviewSections?: OverviewSection[] | undefined
  form1040?: Form1040LineItem[]
  schedule1?: Schedule1Lines
  schedule2?: Schedule2Lines
  scheduleA?: ScheduleALines
  scheduleB?: ScheduleBLines
  scheduleC?: ScheduleCNetIncome
  scheduleD?: ScheduleDData
  scheduleE?: ScheduleELines
  scheduleSE?: ScheduleSELines
  form4952?: Form4952Lines
  form1116?: Form1116Lines
  form6251?: Form6251Lines
  form8959?: Form8959Lines
  form8960?: Form8960Lines
  form8995?: Form8995Lines
  capitalLossCarryover?: CapitalLossCarryoverLines
  form461?: Form461Lines
  form8582?: Form8582Lines
  form8606?: Form8606Lines
  form4797?: Form4797Lines
  scheduleF?: ScheduleFLines
  estimatedTaxPayments?: import('@/lib/finance/estimatedTaxPayments').EstimatedTaxPaymentsData
  k1Docs?: K1ExportEntry[]
  k3Docs?: K3ExportEntry[]
  docs1099?: Doc1099ExportEntry[]
  shortDividends?: ShortDividendSummary
}
