import currency from 'currency.js'

import { getSbpElection } from '@/lib/finance/k1Utils'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import { isFK1StructuredData } from '@/types/finance/tax-document'
import type { Form1116Lines } from '@/types/finance/tax-return'

import { collectForeignTaxSummaries } from './foreignTaxSummaries'
import {
  extractK3IncomeBreakdown,
  extractK3Line4bApportionment,
} from './k3-to-1116'
import type { ForeignTaxSummary } from './types'

/**
 * Assumed foreign withholding rate used to back-calculate an estimated foreign
 * source income amount from the foreign tax withheld reported on a 1099-DIV or
 * K-1 Box 21, when the underlying gross foreign income is not otherwise
 * reported. Treaty rates vary, but 15% is the most common US/treaty rate for
 * portfolio dividends and a reasonable default estimate.
 */
export const ASSUMED_FOREIGN_WITHHOLDING_RATE = 0.15

function pk1(data: FK1StructuredData, box: string): number {
  const v = data.fields[box]?.value
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

export interface ComputeForm1116LinesArgs {
  reviewedK1Docs: TaxDocument[]
  reviewed1099Docs: TaxDocument[]
  foreignTaxSummaries?: ForeignTaxSummary[] | undefined
}

export function computeForm1116Lines({
  reviewedK1Docs,
  reviewed1099Docs,
  foreignTaxSummaries,
}: ComputeForm1116LinesArgs): Form1116Lines {
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  const summaries = foreignTaxSummaries ?? collectForeignTaxSummaries([...reviewedK1Docs, ...reviewed1099Docs])
  const sourceLabel = (summary: ForeignTaxSummary, fallback: string) => summary.sourceLabel ?? fallback

  const incomeSources: { label: string; amount: number }[] = []
  const generalIncomeSources: { label: string; amount: number }[] = []
  const taxSources: { label: string; amount: number }[] = []
  const line4bApportionment: { label: string; interestExpense: number; ratio: number; line4b: number }[] = []
  const sbpElections: { docId: number; partnerName: string; active: boolean; sourcedByPartner: number }[] = []
  for (const { doc, data } of k1Parsed) {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'

    const breakdown = extractK3IncomeBreakdown(data)
    if (breakdown.sourcedByPartner !== 0) {
      sbpElections.push({
        docId: doc.id,
        partnerName,
        active: getSbpElection(data),
        sourcedByPartner: breakdown.sourcedByPartner,
      })
    }

    const appt = extractK3Line4bApportionment(data)
    if (appt) {
      line4bApportionment.push({
        label: partnerName,
        interestExpense: appt.interestExpense,
        ratio: appt.passiveRatio,
        line4b: appt.line4b,
      })
    }
  }

  const k1TaxAddedDocIds = new Set<number | null | undefined>()

  for (const summary of summaries) {
    if (summary.sourceType === 'k1') {
      const partnerName = sourceLabel(summary, 'Partnership')
      const income = summary.grossForeignIncome ?? 0

      if (summary.category === 'passive') {
        if (income !== 0) {
          incomeSources.push({ label: `${partnerName} — K-3 passive income`, amount: income })
        } else if (summary.totalForeignTaxPaid > 0) {
          incomeSources.push({
            label: `${partnerName} — Box 21 (income estimated)`,
            amount: currency(summary.totalForeignTaxPaid).divide(ASSUMED_FOREIGN_WITHHOLDING_RATE).value,
          })
        }
      } else if (summary.category === 'general' && income !== 0) {
        generalIncomeSources.push({ label: `${partnerName} — K-3 general income`, amount: income })
      }

      if (summary.totalForeignTaxPaid > 0 && !k1TaxAddedDocIds.has(summary.sourceDocumentId)) {
        taxSources.push({ label: `${partnerName} — K-1 Box 21`, amount: summary.totalForeignTaxPaid })
        k1TaxAddedDocIds.add(summary.sourceDocumentId)
      }

      continue
    }

    if (summary.sourceType === '1099_div') {
      const payer = sourceLabel(summary, summary.sourceDocumentFormType === 'broker_1099' ? 'Consolidated 1099' : '1099-DIV')
      const incomeLabel = summary.sourceDocumentFormType === 'broker_1099'
        ? `${payer} — Consolidated 1099 DIV (estimated foreign source)`
        : `${payer} — 1099-DIV (estimated foreign source)`
      const taxLabel = summary.sourceDocumentFormType === 'broker_1099'
        ? `${payer} — Consolidated 1099 DIV Box 7`
        : `${payer} — 1099-DIV Box 7`

      incomeSources.push({
        label: incomeLabel,
        amount: currency(summary.totalForeignTaxPaid).divide(ASSUMED_FOREIGN_WITHHOLDING_RATE).value,
      })
      taxSources.push({ label: taxLabel, amount: summary.totalForeignTaxPaid })
      continue
    }

    if (summary.sourceType === '1099_int' && summary.totalForeignTaxPaid > 0) {
      const payer = sourceLabel(summary, summary.sourceDocumentFormType === 'broker_1099' ? 'Consolidated 1099' : '1099-INT')
      const taxLabel = summary.sourceDocumentFormType === 'broker_1099'
        ? `${payer} — Consolidated 1099 INT Box 6`
        : `${payer} — 1099-INT Box 6`
      taxSources.push({ label: taxLabel, amount: summary.totalForeignTaxPaid })
    }
  }

  const totalPassiveIncome = incomeSources.reduce((acc, s) => acc.add(s.amount), currency(0)).value
  const totalGeneralIncome = generalIncomeSources.reduce((acc, s) => acc.add(s.amount), currency(0)).value
  const totalForeignTaxes = taxSources.reduce((acc, s) => acc.add(s.amount), currency(0)).value
  const totalLine4b = line4bApportionment.reduce((acc, s) => acc.add(s.line4b), currency(0)).value

  const creditVsDeduction =
    totalForeignTaxes > 0
      ? {
          creditValue: totalForeignTaxes,
          deductionValue: currency(totalForeignTaxes).multiply(0.37).value,
          recommendation: 'credit' as const,
        }
      : null

  const totalK1Box5 = k1Parsed.reduce((acc, { data }) => currency(acc).add(pk1(data, '5')).value, 0)
  const turboTaxAlert = totalK1Box5 > 0 && totalPassiveIncome < totalK1Box5 * 0.5

  return {
    totalK1Box5,
    incomeSources,
    taxSources,
    totalPassiveIncome,
    totalForeignTaxes,
    generalIncomeSources,
    totalGeneralIncome,
    line4bApportionment,
    totalLine4b,
    creditVsDeduction,
    turboTaxAlert,
    sbpElections,
  }
}
