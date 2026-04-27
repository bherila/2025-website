'use client'

import currency from 'currency.js'
import { Calculator } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Callout, fmtAmt, FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { Button } from '@/components/ui/button'
import {
  ASSUMED_FOREIGN_WITHHOLDING_RATE,
  type ForeignTaxSummary,
  WorksheetModal,
} from '@/finance/1116'
import { getRelevantUnreviewedK1Docs } from '@/finance/1116/unreviewed-k1'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { Form1116Lines } from '@/types/finance/tax-return'

export { computeForm1116Lines } from '@/finance/1116'
export type { Form1116Lines } from '@/types/finance/tax-return'

export type Form1116Category = 'passive' | 'general'

interface Form1116PreviewProps {
  form1116: Form1116Lines
  foreignTaxSummaries: ForeignTaxSummary[]
  allK1Docs?: TaxDocument[]
  selectedYear?: number
  onReviewNow?: (docId: number) => void
  onBulkSetSbpElection?: (active: boolean, docIds: number[]) => Promise<string[]>
  /**
   * When provided, the "1116 Worksheet" button calls this instead of opening the
   * internal modal. Used in dock mode to push the apportionment worksheet as a
   * Miller column.
   */
  onOpenWorksheet?: () => void
  /**
   * When set, scopes rendered content to a single FTC category.
   * - 'passive': renders Parts I/II/III for passive income, hides general blocks
   * - 'general': renders the general-category block, hides passive blocks
   * - undefined (default): renders everything (legacy behavior for tab UI)
   */
  category?: Form1116Category
}

export default function Form1116Preview({
  form1116,
  foreignTaxSummaries,
  allK1Docs = [],
  selectedYear,
  onReviewNow,
  onBulkSetSbpElection,
  onOpenWorksheet,
  category,
}: Form1116PreviewProps) {
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [bulkFailures, setBulkFailures] = useState<string[]>([])
  const [worksheetOpen, setWorksheetOpen] = useState(false)
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
  } = form1116
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

  const showPassive = category === undefined || category === 'passive'
  const showGeneral = category === undefined || category === 'general'
  const headerLabel =
    category === 'general'
      ? 'General Category'
      : category === 'passive'
        ? 'Passive Category'
        : 'Foreign Tax Credit'

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
          <h2 className="text-base font-semibold mb-0.5">Form 1116 — {headerLabel}</h2>
          <p className="text-xs text-muted-foreground">
            {category === 'general'
              ? 'General category foreign tax credit — separate basket from passive income.'
              : 'Passive category foreign tax credit — dollar-for-dollar offset against U.S. tax.'}
          </p>
        </div>
        {foreignTaxSummaries.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => onOpenWorksheet ? onOpenWorksheet() : setWorksheetOpen(true)}
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

      {category === undefined &&
        (totalGeneralIncome > 0 ? (
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
        ))}

      {showPassive && (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
          <FormBlock title="Part I — Foreign Source Passive Income">
            {incomeSources.map((src, i) => (
              <FormLine key={i} boxRef="1a" label={src.label} value={src.amount} />
            ))}
            {incomeSources.length === 0 && (
              <FormLine boxRef="1a" label="No foreign passive income identified" raw="—" />
            )}
            <FormTotalLine boxRef="1c" label="Total foreign passive income" value={totalPassiveIncome} />
          </FormBlock>

          <FormBlock title="Part II — Foreign Taxes Paid or Accrued">
            {taxSources.map((src, i) => (
              <FormLine key={i} boxRef="8" label={src.label} value={src.amount} />
            ))}
            {taxSources.length === 0 && <FormLine boxRef="8" label="No foreign taxes identified" raw="—" />}
            <FormTotalLine boxRef="9" label="Total foreign taxes paid or accrued" value={totalForeignTaxes} />
          </FormBlock>
        </div>
      )}

      {showGeneral && generalIncomeSources.length > 0 && (
        <FormBlock title="Part I — Foreign Source General Income">
          {generalIncomeSources.map((src, i) => (
            <FormLine key={i} boxRef="1a" label={src.label} value={src.amount} />
          ))}
          <FormTotalLine boxRef="1c" label="Total foreign general income" value={totalGeneralIncome} />
          <FormLine
            boxRef="10"
            label="Foreign taxes attributable to general category"
            raw="See K-3 Part III Section 4 per-basket breakdown"
          />
        </FormBlock>
      )}

      {showGeneral && generalIncomeSources.length === 0 && category === 'general' && (
        <Callout kind="info" title="No general category data">
          <p>
            No general category foreign income detected for this return. All column (d) amounts are U.S.-source
            (country code XX). Only the passive category Form 1116 is required.
          </p>
        </Callout>
      )}

      {/* Line 4b — Apportioned Interest Expense (passive only) */}
      {showPassive && line4bApportionment.length > 0 && (
        <FormBlock title="Line 4b — Apportioned Interest Expense (Asset Method)">
          {line4bApportionment.map((row, i) => (
            <div key={i} className="space-y-0.5">
              <FormLine label={`${row.label} — allocable interest expense`} value={row.interestExpense} />
              <FormLine
                label={`${row.label} — passive asset ratio`}
                raw={`${(row.ratio * 100).toFixed(2)}%`}
              />
              <FormLine boxRef="4b" label={`${row.label} — Line 4b (expense × ratio)`} value={row.line4b} />
            </div>
          ))}
          <FormTotalLine boxRef="4b" label="Total apportioned interest" value={totalLine4b} />
          <FormLine
            note
            label="Enter on Form 1116, Part I, Line 4b"
            raw="Reduce passive foreign income by this amount"
          />
        </FormBlock>
      )}

      {/* Part III — Limitation (passive only — general would need its own basket calc) */}
      {showPassive && (
      <FormBlock title="Part III — Limitation Calculation (Estimated)">
        <FormLine boxRef="1c" label="Foreign passive income (Part I)" value={totalPassiveIncome} />
        {totalLine4b > 0 && <FormLine boxRef="4b" label="Less: apportioned interest (Line 4b)" value={-totalLine4b} />}
        <FormLine boxRef="6" label="Total income (estimated — enter from prior return)" raw="~see note" />
        <FormLine boxRef="7" label="Limiting fraction (foreign income ÷ total income)" raw="~see note" />
        <FormLine boxRef="8" label="U.S. tax before credits (estimated)" raw="~see note" />
        <FormLine boxRef="9" label="FTC limitation (fraction × U.S. tax)" raw="~see note" />
        <FormLine boxRef="11" label="Actual foreign taxes paid (Part II)" value={totalForeignTaxes} />
        <FormTotalLine
          boxRef="12"
          label={
            totalPassiveIncome >= currency(totalForeignTaxes).divide(ASSUMED_FOREIGN_WITHHOLDING_RATE).value
              ? 'Credit allowed — likely FULLY ALLOWED ✓'
              : 'Credit allowed (subject to limitation)'
          }
          value={totalForeignTaxes}
          double
        />
        <FormLine boxRef="14" label="Carryforward (if any)" raw="$0 (estimate)" />
      </FormBlock>
      )}

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

      {showPassive && sbpElections.length > 0 && (
        <FormBlock title="Sourced-by-Partner (Col f) Election — Form 1116 Impact">
          <FormLine
            note
            label="What is this?"
            raw="K-3 Part II column (f) amounts are classified 'Sourced by Partner'. By default they are treated as foreign-source income, increasing your FTC base."
          />
          <FormLine
            note
            label="Election available"
            raw="You may elect (per Treas. Reg. §1.861-9T) to treat these as U.S.-source, which reduces FTC base but may be required if you are not subject to a tax treaty or §901(j) override."
          />
          {bulkFailures.length > 0 && (
            <FormLine note label="Bulk update failures" raw={`Could not update: ${bulkFailures.join(', ')}`} />
          )}
          {sbpElections.map((e, i) => (
            <div key={i} className="border-t border-dashed border-border/50 py-1.5 px-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium truncate flex-1">{e.partnerName}</span>
                <span className={`font-mono tabular-nums text-[13px] shrink-0 ${e.sourcedByPartner < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'}`}>
                  {fmtAmt(e.sourcedByPartner)}
                </span>
                {onReviewNow && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => onReviewNow(e.docId)}
                  >
                    Review K-1
                  </Button>
                )}
              </div>
              <div className={`text-[11px] ${e.active ? 'text-emerald-600 dark:text-emerald-500' : 'text-muted-foreground'}`}>
                {e.active
                  ? '✓ Elected — col (f) treated as U.S. source (excluded from foreign income)'
                  : '✗ Not elected — col (f) treated as foreign source (included in foreign income)'}
              </div>
            </div>
          ))}
          {sbpElections.length > 1 && onBulkSetSbpElection && (
            <div className="flex gap-2 px-3 py-2 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                disabled={bulkUpdating}
                className="text-xs h-7"
                onClick={() => void runBulkToggle(true)}
              >
                {bulkUpdating ? 'Updating…' : 'Elect all'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkUpdating}
                className="text-xs h-7"
                onClick={() => void runBulkToggle(false)}
              >
                {bulkUpdating ? 'Updating…' : 'Unelect all'}
              </Button>
            </div>
          )}
        </FormBlock>
      )}

      {showPassive && turboTaxAlert && (
        <Callout kind="alert" title="⚠ FTC Worksheet Line 1d — Correction Required">
          <p>
            The FTC Worksheet may prefill Line 1d with K-1 Box 5 interest (
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
        foreignTaxSummaries={foreignTaxSummaries}
        {...(selectedYear !== undefined ? { taxYear: selectedYear } : {})}
      />
    </div>
  )
}
