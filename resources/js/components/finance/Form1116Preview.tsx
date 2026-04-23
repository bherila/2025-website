'use client'

import currency from 'currency.js'
import { Calculator } from 'lucide-react'
import { useMemo, useState } from 'react'

import { isFK1StructuredData } from '@/components/finance/k1'
import { Callout, fmtAmt, FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { Button } from '@/components/ui/button'
import { collectForeignTaxSummaries, type ForeignTaxSummary, WorksheetModal } from '@/finance/1116'
import {
  extractK3IncomeBreakdown,
  extractK3Line4bApportionment,
} from '@/finance/1116/k3-to-1116'
import { getRelevantUnreviewedK1Docs } from '@/finance/1116/unreviewed-k1'
import { getSbpElection } from '@/lib/finance/k1Utils'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { Form1116Lines } from '@/types/finance/tax-return'

export type { Form1116Lines } from '@/types/finance/tax-return'

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Assumed foreign withholding rate used to back-calculate an estimated foreign
 * source income amount from the foreign tax withheld reported on a 1099-DIV or
 * K-1 Box 21, when the underlying gross foreign income is not otherwise
 * reported. Treaty rates vary, but 15% is the most common US/treaty rate for
 * portfolio dividends and a reasonable default estimate.
 */
const ASSUMED_FOREIGN_WITHHOLDING_RATE = 0.15

// ── Helpers ───────────────────────────────────────────────────────────────────

function pk1(data: FK1StructuredData, box: string): number {
  const v = data.fields[box]?.value
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

// ── Main component ────────────────────────────────────────────────────────────

interface Form1116PreviewProps {
  reviewedK1Docs: TaxDocument[]
  allK1Docs?: TaxDocument[]
  reviewed1099Docs: TaxDocument[]
  foreignTaxSummaries?: ForeignTaxSummary[]
  selectedYear?: number
  income1099: {
    interestIncome: currency
    dividendIncome: currency
    qualifiedDividends: currency
  }
  onReviewNow?: (docId: number) => void
  onBulkSetSbpElection?: (active: boolean, docIds: number[]) => Promise<string[]>
}

interface ComputeForm1116LinesArgs {
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

    // Collect SBP election state for any K-1 with col-f (Sourced by Partner) amounts.
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

      if (summary.totalForeignTaxPaid > 0) {
        taxSources.push({ label: `${partnerName} — K-1 Box 21`, amount: summary.totalForeignTaxPaid })
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

export default function Form1116Preview({
  reviewedK1Docs,
  allK1Docs = [],
  reviewed1099Docs,
  foreignTaxSummaries,
  selectedYear,
  onReviewNow,
  onBulkSetSbpElection,
}: Form1116PreviewProps) {
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [bulkFailures, setBulkFailures] = useState<string[]>([])
  const [worksheetOpen, setWorksheetOpen] = useState(false)
  const computed = computeForm1116Lines({ reviewedK1Docs, reviewed1099Docs, foreignTaxSummaries })
  const worksheetSummaries = foreignTaxSummaries ?? collectForeignTaxSummaries([...reviewedK1Docs, ...reviewed1099Docs])
  const {
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
    totalK1Box5 = 0,
    sbpElections = [],
  } = computed
  const relevantUnreviewed = useMemo(() => getRelevantUnreviewedK1Docs(allK1Docs), [allK1Docs])

  const runBulkToggle = async (nextValue: boolean) => {
    if (!onBulkSetSbpElection || bulkUpdating) {
      return
    }

    const docIds = sbpElections.map((entry) => entry.docId)
    setBulkUpdating(true)
    try {
      const failures = await onBulkSetSbpElection(nextValue, docIds)
      setBulkFailures(failures)
    } finally {
      setBulkUpdating(false)
    }
  }

  const simplifiedElectionThreshold = 300
  const aboveSimplifiedThreshold = totalForeignTaxes > simplifiedElectionThreshold

  if (totalForeignTaxes === 0 && totalPassiveIncome === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No foreign tax or foreign income data found in reviewed documents.
        <br />
        Review K-1 and 1099 documents to see Form 1116 analysis.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold mb-0.5">Form 1116 — Foreign Tax Credit</h2>
          <p className="text-xs text-muted-foreground">
            Passive category foreign tax credit — dollar-for-dollar offset against U.S. tax.
          </p>
        </div>
        {worksheetSummaries.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => setWorksheetOpen(true)}
          >
            <Calculator className="h-3 w-3" />
            1116 Worksheet
          </Button>
        )}
      </div>

      {aboveSimplifiedThreshold ? (
        <Callout kind="warn" title="⚠ Simplified Limitation Election Does NOT Apply">
          <p>
            Total creditable foreign taxes (<strong>{fmtAmt(totalForeignTaxes, 2)}</strong>) exceed the $300 threshold
            ($600 if MFJ). You must complete Form 1116.
          </p>
        </Callout>
      ) : (
        <Callout kind="good" title="✓ Simplified Election May Apply">
          <p>
            Total FTC ({fmtAmt(totalForeignTaxes, 2)}) ≤ $300. You may enter directly on Schedule 3 Line 1 without
            completing Form 1116. Confirm no foreign income in multiple baskets.
          </p>
        </Callout>
      )}

      {relevantUnreviewed.length > 0 && (
        <Callout kind="warn" title="⚠ Unreviewed K-1 documents are currently excluded from Form 1116 totals">
          <div className="space-y-2">
            {relevantUnreviewed.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-2">
                <span>{doc.partnerName}</span>
                {onReviewNow && (
                  <button
                    type="button"
                    className="text-amber-700 dark:text-amber-300 underline underline-offset-2 hover:opacity-80"
                    onClick={() => onReviewNow(doc.id)}
                  >
                    Review now
                  </button>
                )}
              </div>
            ))}
          </div>
        </Callout>
      )}

      {totalGeneralIncome > 0 ? (
        <Callout kind="warn" title="⚠ General Category Income Detected — Second Form 1116 Required">
          <p>
            General category foreign income of <strong>{fmtAmt(totalGeneralIncome, 2)}</strong> was detected in K-3
            Part II. A separate Form 1116 (general category) is required in addition to the passive category form.
          </p>
        </Callout>
      ) : (
        <Callout kind="good" title="✓ No General Category Form 1116 Required">
          <p>
            All column (d) general category amounts have country code XX ("Sourced by partner"), which is U.S.-source
            for domestic partners. One Form 1116 (passive category) only.
          </p>
        </Callout>
      )}

      {/* Passive Form 1116 — Parts I and II */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FormBlock title="Part I — Foreign Source Passive Income">
          {incomeSources.map((src, i) => (
            <FormLine key={i} label={src.label} value={src.amount} />
          ))}
          {incomeSources.length === 0 && <FormLine label="No foreign passive income identified" raw="—" />}
          <FormTotalLine label="Total foreign passive income" value={totalPassiveIncome} />
        </FormBlock>

        <FormBlock title="Part II — Foreign Taxes Paid">
          {taxSources.map((src, i) => (
            <FormLine key={i} label={src.label} value={src.amount} />
          ))}
          {taxSources.length === 0 && <FormLine label="No foreign taxes identified" raw="—" />}
          <FormTotalLine label="Total foreign taxes paid" value={totalForeignTaxes} />
        </FormBlock>
      </div>

      {/* General Category Form 1116 — if applicable */}
      {generalIncomeSources.length > 0 && (
        <FormBlock title="General Category Form 1116 — Part I (Foreign Source General Income)">
          {generalIncomeSources.map((src, i) => (
            <FormLine key={i} label={src.label} value={src.amount} />
          ))}
          <FormTotalLine label="Total foreign general income" value={totalGeneralIncome} />
          <FormLine
            label="Foreign taxes attributable to general category"
            raw="See K-3 Part III Section 4 per-basket breakdown"
          />
        </FormBlock>
      )}

      {/* Line 4b — Apportioned Interest Expense */}
      {line4bApportionment.length > 0 && (
        <FormBlock title="Line 4b — Apportioned Interest Expense (Asset Method)">
          {line4bApportionment.map((row, i) => (
            <div key={i} className="space-y-0.5">
              <FormLine label={`${row.label} — allocable interest expense`} value={row.interestExpense} />
              <FormLine
                label={`${row.label} — passive asset ratio`}
                raw={`${(row.ratio * 100).toFixed(2)}%`}
              />
              <FormLine label={`${row.label} — Line 4b (expense × ratio)`} value={row.line4b} />
            </div>
          ))}
          <FormTotalLine label="Total apportioned interest (Line 4b)" value={totalLine4b} />
          <FormLine
            label="Enter on Form 1116, Part I, Line 4b"
            raw="Reduce passive foreign income by this amount"
          />
        </FormBlock>
      )}

      {/* Part III — Limitation */}
      <FormBlock title="Part III — Limitation Calculation (Estimated)">
        <FormLine label="Foreign passive income (Part I)" value={totalPassiveIncome} />
        {totalLine4b > 0 && <FormLine label="Less: apportioned interest (Line 4b)" value={-totalLine4b} />}
        <FormLine label="Total income (estimated — enter from prior return)" raw="~see note" />
        <FormLine label="Limiting fraction" raw="foreign income ÷ total income" />
        <FormLine label="U.S. tax before credits (estimated)" raw="~see note" />
        <FormLine label="FTC limitation (fraction × U.S. tax)" raw="~see note" />
        <FormLine label="Actual foreign taxes paid (Part II)" value={totalForeignTaxes} />
        <FormTotalLine
          label={
            totalPassiveIncome >= currency(totalForeignTaxes).divide(ASSUMED_FOREIGN_WITHHOLDING_RATE).value
              ? 'Credit allowed — likely FULLY ALLOWED ✓'
              : 'Credit allowed (subject to limitation)'
          }
          value={totalForeignTaxes}
          double
        />
        <FormLine label="Carryforward (if any)" raw="$0 (estimate)" />
      </FormBlock>

      {/* Credit vs. Deduction Comparison */}
      {creditVsDeduction && (
        <FormBlock title="Credit vs. Deduction — Which Is Better?">
          <FormLine
            label="Option A: Foreign Tax Credit (Form 1116)"
            value={creditVsDeduction.creditValue}
          />
          <FormLine
            label="Option B: Foreign Tax Deduction (Sch. A, itemized) — est. at 37% marginal"
            value={creditVsDeduction.deductionValue}
          />
          <FormLine
            label="Option B at 32% marginal"
            value={currency(creditVsDeduction.creditValue).multiply(0.32).value}
          />
          <FormLine
            label="Option B at 24% marginal"
            value={currency(creditVsDeduction.creditValue).multiply(0.24).value}
          />
          <FormLine
            label="Recommendation"
            raw="Take the Credit — saves more at any marginal rate"
          />
          <FormLine
            label="Exception"
            raw="Use deduction only if FTC is fully limited (rare) or under AMT"
          />
        </FormBlock>
      )}

      {sbpElections.length > 0 && (
        <FormBlock title="Sourced-by-Partner (Col f) Election — Form 1116 Impact">
          {sbpElections.length > 1 && onBulkSetSbpElection && (
            <div className="flex gap-2 pb-2">
              <button
                type="button"
                disabled={bulkUpdating}
                className="text-xs px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50"
                onClick={() => void runBulkToggle(true)}
              >
                {bulkUpdating ? 'Updating…' : 'Elect all'}
              </button>
              <button
                type="button"
                disabled={bulkUpdating}
                className="text-xs px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50"
                onClick={() => void runBulkToggle(false)}
              >
                {bulkUpdating ? 'Updating…' : 'Unelect all'}
              </button>
            </div>
          )}
          {bulkFailures.length > 0 && (
            <FormLine
              label="Bulk update failures"
              raw={`Could not update: ${bulkFailures.join(', ')}`}
            />
          )}
          <FormLine
            label="What is this?"
            raw="K-3 Part II column (f) amounts are classified 'Sourced by Partner'. By default they are treated as foreign-source income, increasing your FTC base."
          />
          <FormLine
            label="Election available"
            raw="You may elect (per Treas. Reg. §1.861-9T) to treat these amounts as U.S.-source, which reduces FTC base but may be required if you are not subject to a tax treaty or §901(j) override."
          />
          {sbpElections.map((e, i) => (
            <div key={i} className="space-y-0.5">
              <FormLine
                label={`${e.partnerName} — Col (f) net`}
                value={e.sourcedByPartner}
              />
              <FormLine
                label={`${e.partnerName} — Election: treat col (f) as U.S. source`}
                raw={e.active ? '✓ Active — col (f) excluded from foreign income' : '✗ Inactive — col (f) included in foreign income'}
              />
            </div>
          ))}
          <FormLine
            label="To change this election"
            raw="Open the K-1 review modal → scroll to the K-3 section → toggle the checkbox"
          />
        </FormBlock>
      )}

      {turboTaxAlert && (
        <Callout kind="alert" title="⚠ TurboTax FTC Worksheet Line 1d — Correction Required">
          <p>
            TurboTax may prefill Line 1d with K-1 Box 5 interest (
            <strong>{fmtAmt(totalK1Box5, 2)}</strong>) — but Box 5 interest is entirely U.S.-sourced per K-3 Part II
            Line 6, column (a). Set Line 1d to the K-3 passive foreign income amount only (
            <strong>{fmtAmt(totalPassiveIncome, 2)}</strong>). Overstating foreign passive income inflates your FTC
            and may trigger an IRS notice.
          </p>
        </Callout>
      )}

      <Callout kind="info" title="ℹ Where This Flows on the Return">
        <p>
          The allowable FTC flows to <strong>Schedule 3, Line 1</strong> (foreign tax credit). It is a
          dollar-for-dollar credit against your regular federal income tax.
        </p>
        <p>The FTC does NOT reduce the Net Investment Income Tax (NIIT, Form 8960). See the Tax Estimate tab for the full Form 8960 computation.</p>
        {totalGeneralIncome > 0 && (
          <p>
            <strong>Two Form 1116s required:</strong> one for passive category, one for general category.
          </p>
        )}
        {totalLine4b > 0 && (
          <p>
            <strong>Line 4b:</strong> Enter {fmtAmt(totalLine4b, 2)} on Form 1116, Part I, Line 4b (apportioned
            interest expense per K-3 Part III asset method).
          </p>
        )}
      </Callout>

      <WorksheetModal
        open={worksheetOpen}
        onClose={() => setWorksheetOpen(false)}
        foreignTaxSummaries={worksheetSummaries}
        {...(selectedYear !== undefined ? { taxYear: selectedYear } : {})}
      />
    </div>
  )
}
