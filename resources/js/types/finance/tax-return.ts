import type { Form1040LineItem } from '@/components/finance/Form1040Preview'
import type { Form1116Lines } from '@/components/finance/Form1116Preview'
import type { Form4952Lines } from '@/components/finance/Form4952Preview'
import type { ScheduleALines } from '@/components/finance/ScheduleAPreview'
import type { ScheduleBLines } from '@/components/finance/ScheduleBPreview'
import type { ScheduleCNetIncome } from '@/components/finance/ScheduleCPreview'
import type { ShortDividendSummary } from '@/lib/finance/shortDividendAnalysis'
import type { ScheduleDData } from '@/lib/tax/scheduleD'

export interface ScheduleELines {
  grandTotal: number
  totalPassive: number
  totalNonpassive: number
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

export interface TaxReturn1040 {
  year: number
  form1040?: Form1040LineItem[]
  scheduleA?: ScheduleALines
  scheduleB?: ScheduleBLines
  scheduleC?: ScheduleCNetIncome
  scheduleD?: ScheduleDData
  scheduleE?: ScheduleELines
  form4952?: Form4952Lines
  form1116?: Form1116Lines
  k1Docs?: K1ExportEntry[]
  k3Docs?: K3ExportEntry[]
  docs1099?: Doc1099ExportEntry[]
  shortDividends?: ShortDividendSummary
}
