'use client'

import currency from 'currency.js'

import { isFK1StructuredData } from '@/components/finance/k1'
import { FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { ScheduleBLines, ScheduleBSourceLine } from '@/types/finance/tax-return'

export type { ScheduleBLines, ScheduleBSourceLine } from '@/types/finance/tax-return'

interface ScheduleBPreviewProps {
  interestIncome: currency
  dividendIncome: currency
  qualifiedDividends: currency
  selectedYear: number
  reviewedK1Docs?: TaxDocument[]
  reviewed1099Docs?: TaxDocument[]
  onOpenDoc?: (docId: number) => void
}


export function computeScheduleB(
  reviewedK1Docs: TaxDocument[],
  reviewed1099Docs: TaxDocument[],
  income1099: {
    interestIncome: currency
    dividendIncome: currency
    qualifiedDividends: currency
  },
): ScheduleBLines {
  const interestLines: ScheduleBSourceLine[] = []
  const dividendLines: ScheduleBSourceLine[] = []
  const qualDividendLines: ScheduleBSourceLine[] = []

  for (const doc of reviewedK1Docs) {
    const data = isFK1StructuredData(doc.parsed_data) ? doc.parsed_data : null
    if (!data) continue
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ??
      doc.employment_entity?.display_name ??
      'Partnership'

    const box5 = parseFloat(data.fields['5']?.value ?? '0')
    if (!isNaN(box5) && box5 !== 0) {
      interestLines.push({ label: `${partnerName} — K-1 Box 5`, amount: box5, docId: doc.id })
    }
    const box6a = parseFloat(data.fields['6a']?.value ?? '0')
    if (!isNaN(box6a) && box6a !== 0) {
      dividendLines.push({ label: `${partnerName} — K-1 Box 6a`, amount: box6a, docId: doc.id })
    }
    const box6b = parseFloat(data.fields['6b']?.value ?? '0')
    if (!isNaN(box6b) && box6b !== 0) {
      qualDividendLines.push({ label: `${partnerName} — K-1 Box 6b`, amount: box6b, docId: doc.id })
    }
  }

  for (const doc of reviewed1099Docs) {
    const p = doc.parsed_data as Record<string, unknown>
    const payer = (p?.payer_name as string | undefined) ?? doc.employment_entity?.display_name ?? '1099 Payer'

    if (doc.form_type === '1099_int' || doc.form_type === '1099_int_c') {
      const box1 = p?.box1_interest as number | undefined
      if (box1 != null && box1 !== 0) {
        interestLines.push({ label: `${payer} — 1099-INT Box 1`, amount: box1, docId: doc.id })
      }
    }

    if (doc.form_type === '1099_div' || doc.form_type === '1099_div_c') {
      const box1a = (p?.box1a_ordinary ?? p?.box1_ordinary) as number | undefined
      if (box1a != null && box1a !== 0) {
        dividendLines.push({ label: `${payer} — 1099-DIV Box 1a`, amount: box1a, docId: doc.id })
      }
      const box1b = (p?.box1b_qualified ?? p?.box1b) as number | undefined
      if (box1b != null && box1b !== 0) {
        qualDividendLines.push({ label: `${payer} — 1099-DIV Box 1b`, amount: box1b, docId: doc.id })
      }
    }
  }

  const interestTotal = interestLines.length > 0
    ? interestLines.reduce((acc, l) => acc.add(l.amount), currency(0)).value
    : income1099.interestIncome.value
  const dividendTotal = dividendLines.length > 0
    ? dividendLines.reduce((acc, l) => acc.add(l.amount), currency(0)).value
    : income1099.dividendIncome.value
  const qualifiedDivTotal = qualDividendLines.length > 0
    ? qualDividendLines.reduce((acc, l) => acc.add(l.amount), currency(0)).value
    : income1099.qualifiedDividends.value

  return {
    interestTotal,
    dividendTotal,
    qualifiedDivTotal,
    interestLines,
    dividendLines,
    qualifiedDividendLines: qualDividendLines,
  }
}

export default function ScheduleBPreview({
  interestIncome,
  dividendIncome,
  qualifiedDividends,
  selectedYear,
  reviewedK1Docs = [],
  reviewed1099Docs = [],
  onOpenDoc,
}: ScheduleBPreviewProps) {
  const { interestLines, dividendLines, qualifiedDividendLines, interestTotal, dividendTotal, qualifiedDivTotal } = computeScheduleB(
    reviewedK1Docs,
    reviewed1099Docs,
    { interestIncome, dividendIncome, qualifiedDividends },
  )

  const hasLineSources = interestLines.length > 0 || dividendLines.length > 0

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold mb-0.5">Schedule B — {selectedYear}</h3>
        <p className="text-xs text-muted-foreground">Interest and Ordinary Dividends</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Part I — Interest */}
        <FormBlock title="Part I — Interest Income">
          {hasLineSources
            ? interestLines.map((line, i) => (
                <FormLine
                  key={i}
                  label={line.label}
                  value={line.amount}
                  {...(onOpenDoc && line.docId != null ? { onDetails: () => onOpenDoc(line.docId!) } : {})}
                />
              ))
            : interestTotal !== 0 && <FormLine label="Total interest income" value={interestTotal} />}
          {interestTotal === 0 && interestLines.length === 0 && (
            <FormLine label="No interest income reported" raw="—" />
          )}
          <FormTotalLine boxRef="4" label="Total interest" value={interestTotal} />
        </FormBlock>

        {/* Part II — Dividends */}
        <FormBlock title="Part II — Ordinary Dividends">
          {hasLineSources
            ? dividendLines.map((line, i) => (
                <FormLine
                  key={i}
                  label={line.label}
                  value={line.amount}
                  {...(onOpenDoc && line.docId != null ? { onDetails: () => onOpenDoc(line.docId!) } : {})}
                />
              ))
            : dividendTotal !== 0 && <FormLine label="Total ordinary dividends" value={dividendTotal} />}
          {dividendTotal === 0 && dividendLines.length === 0 && (
            <FormLine label="No dividend income reported" raw="—" />
          )}
          <FormTotalLine boxRef="6" label="Total ordinary dividends" value={dividendTotal} />
          {qualifiedDivTotal > 0 && (
            <>
              {qualifiedDividendLines.length > 0
                ? qualifiedDividendLines.map((line, i) => (
                    <FormLine
                      key={`qd-${i}`}
                      label={line.label}
                      value={line.amount}
                      {...(onOpenDoc && line.docId != null ? { onDetails: () => onOpenDoc(line.docId!) } : {})}
                    />
                  ))
                : <FormLine label="Qualified dividends" value={qualifiedDivTotal} />}
              <FormTotalLine boxRef="7" label="Qualified dividends" value={qualifiedDivTotal} />
            </>
          )}
        </FormBlock>
      </div>
    </div>
  )
}
