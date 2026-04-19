import type { ShortDividendSummary } from '@/lib/finance/shortDividendAnalysis'
import type { ScheduleDData } from '@/lib/tax/scheduleD'

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

export interface ScheduleALines {
  invIntSources: { label: string; amount: number }[]
  totalInvIntExpense: number
}

export interface ScheduleBSourceLine {
  label: string
  amount: number
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
  niiBefore: number
  totalQualDiv: number
  deductibleInvestmentInterestExpense: number
  disallowedCarryforward: number
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
  niit: { niiComponents: { label: string; amount: number }[]; totalNII: number; niitEstimate: number } | null
  creditVsDeduction: { creditValue: number; deductionValue: number; recommendation: 'credit' } | null
  turboTaxAlert: boolean
  totalK1Box5?: number
}

export interface K1ExportEntry {
  entityName: string
  ein?: string
  fields: Record<string, string | number>
  codes: Record<string, { code: string; value: string }[]>
}

export interface K3ExportEntry {
  entityName: string
  sections: { sectionId: string; title: string; data: unknown }[]
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
  entries: { label: string; qbiIncome: number; ubia: number; sectionNotes: string; qbiComponent: number }[]
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

export interface TaxReturn1040 {
  year: number
  overviewSections?: OverviewSection[] | undefined
  form1040?: Form1040LineItem[]
  scheduleA?: ScheduleALines
  scheduleB?: ScheduleBLines
  scheduleC?: ScheduleCNetIncome
  scheduleD?: ScheduleDData
  scheduleE?: ScheduleELines
  form4952?: Form4952Lines
  form1116?: Form1116Lines
  form8995?: Form8995Lines
  k1Docs?: K1ExportEntry[]
  k3Docs?: K3ExportEntry[]
  docs1099?: Doc1099ExportEntry[]
  shortDividends?: ShortDividendSummary
}
