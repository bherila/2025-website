'use client'

import { isFK1StructuredData } from '@/components/finance/k1'
import { Callout, fmtAmt, FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { computeForm8995Lines } from '@/finance/8995/k1-to-8995'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { Form8995Lines } from '@/types/finance/tax-return'

export type { Form8995Lines } from '@/types/finance/tax-return'

interface Form8995PreviewProps {
  reviewedK1Docs: TaxDocument[]
  /** Form 1040 Line 9 total income estimate — used to compute estimated taxable income. */
  totalIncome: number
  selectedYear: number
  isMarried?: boolean
}

export function computeForm8995({ reviewedK1Docs, totalIncome, selectedYear, isMarried = false }: Form8995PreviewProps): Form8995Lines {
  const k1Data = reviewedK1Docs
    .map((d) => {
      const data = isFK1StructuredData(d.parsed_data) ? d.parsed_data : null
      if (!data) return null
      const label = (data as FK1StructuredData).fields['B']?.value?.split('\n')[0]
        ?? d.employment_entity?.display_name
        ?? 'Partnership'
      return { data: data as FK1StructuredData, label }
    })
    .filter((x): x is { data: FK1StructuredData; label: string } => x !== null)

  return computeForm8995Lines(k1Data, totalIncome, selectedYear, isMarried)
}

export default function Form8995Preview({ reviewedK1Docs, totalIncome, selectedYear, isMarried = false }: Form8995PreviewProps) {
  const computed = computeForm8995({ reviewedK1Docs, totalIncome, selectedYear, isMarried })
  const {
    entries,
    totalQBI,
    totalQBIComponent,
    estimatedTaxableIncome,
    stdDedApplied,
    taxableIncomeCap,
    estimatedDeduction,
    aboveThreshold,
    thresholdSingle,
    thresholdMFJ,
  } = computed

  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No Section 199A / QBI data found in reviewed K-1 documents.
        <br />
        QBI is reported in K-1 Box 20 Code S. Review K-1 documents to see Form 8995 analysis.
      </div>
    )
  }

  const threshold = isMarried ? thresholdMFJ : thresholdSingle

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Form 8995 — Qualified Business Income Deduction (Sec. 199A)</h2>
        <p className="text-xs text-muted-foreground">
          20% deduction on qualified business income from pass-through entities — enters Form 1040 Line 13.
        </p>
      </div>

      {aboveThreshold ? (
        <Callout kind="warn" title="⚠ Income Exceeds Phase-In Threshold — W-2 Wage Limitation May Apply">
          <p>
            Estimated taxable income (<strong>{fmtAmt(estimatedTaxableIncome, 0)}</strong>) exceeds the{' '}
            {isMarried ? 'MFJ' : 'single'} threshold of{' '}
            <strong>{fmtAmt(threshold, 0)}</strong> for {selectedYear}. Use Form 8995-A.
            The deduction may be limited to the greater of 50% of W-2 wages or 25% of W-2 wages + 2.5% of UBIA.
            W-2 wages are reported in the Section 199A statement attached to Box 20 Code S.
          </p>
        </Callout>
      ) : (
        <Callout kind="good" title="✓ Below Threshold — Simplified Calculation Applies">
          <p>
            Estimated taxable income (<strong>{fmtAmt(estimatedTaxableIncome, 0)}</strong>) is below the{' '}
            {isMarried ? 'MFJ' : 'single'} threshold of{' '}
            <strong>{fmtAmt(threshold, 0)}</strong>. Use Form 8995 (simplified).
            No W-2 wage or UBIA limitation — deduction is simply 20% × QBI, capped at 20% of taxable income.
          </p>
        </Callout>
      )}

      {/* Per-partnership breakdown */}
      <FormBlock title="Per-Partnership QBI Breakdown (Box 20 Code S)">
        {entries.map((entry, i) => (
          <div key={i} className="space-y-0.5 pb-2 border-b last:border-0 last:pb-0">
            <FormLine label={`${entry.label} — QBI income`} value={entry.qbiIncome} />
            {entry.ubia !== 0 && (
              <FormLine label={`${entry.label} — UBIA of qualified property (Box 20 V)`} value={entry.ubia} />
            )}
            <FormLine label={`${entry.label} — 20% QBI component`} value={entry.qbiComponent} />
            {entry.sectionNotes && (
              <FormLine label={`${entry.label} — Section 199A statement notes`} raw={entry.sectionNotes} />
            )}
          </div>
        ))}
        <FormTotalLine label="Total QBI income" value={totalQBI} />
        <FormTotalLine label="Total 20% QBI component (before cap)" value={totalQBIComponent} />
      </FormBlock>

      {/* Taxable income cap */}
      <FormBlock title="Taxable Income Cap (Form 8995 Line 15)">
        <FormLine label="Total income (Form 1040 Line 9 estimate)" value={totalIncome} />
        <FormLine
          label={`Less: estimated standard deduction (${selectedYear} ${isMarried ? 'MFJ' : 'Single'})`}
          value={-stdDedApplied}
        />
        <FormLine label="Estimated taxable income (Line 15 proxy)" value={estimatedTaxableIncome} />
        <FormLine label="20% of estimated taxable income (cap)" value={taxableIncomeCap} />
        <FormLine
          label="Note"
          raw="Actual taxable income includes capital gains, K-1 income, Schedule E, etc. — enter from your return."
        />
      </FormBlock>

      {/* Deduction summary */}
      <FormBlock title="Estimated QBI Deduction (Form 1040 Line 13)">
        <FormLine label="QBI component (20% × QBI)" value={totalQBIComponent} />
        <FormLine label="Taxable income cap (20% × taxable income)" value={taxableIncomeCap} />
        <FormTotalLine
          label="Estimated QBI deduction — lesser of above"
          value={estimatedDeduction}
          double
        />
        <FormLine label="Enter on Form 1040 Line 13" raw="Below-the-line deduction — reduces taxable income but not AGI" />
      </FormBlock>

      {/* Callouts */}
      <Callout kind="warn" title="⚠ QBI Deduction Does NOT Reduce Net Investment Income (NIIT)">
        <p>
          The QBI deduction reduces regular taxable income (Form 1040 Line 15) but has{' '}
          <strong>no effect on Net Investment Income</strong> (Form 8960). Passive K-1 income remains
          fully subject to the 3.8% NIIT regardless of the QBI deduction. See the Form 1116 tab for
          NIIT estimates.
        </p>
      </Callout>

      <Callout kind="good" title="✓ QBI Deduction Is Allowed for AMT (Form 6251)">
        <p>
          Post-TCJA, the Sec. 199A deduction is fully allowed for Alternative Minimum Tax purposes.
          Do <strong>not</strong> add it back on Form 6251.
        </p>
      </Callout>

      <Callout kind="warn" title="⚠ State Conformity Varies — Check Your State">
        <p>
          Many states do <strong>not</strong> conform to the Sec. 199A deduction (California, New York,
          New Jersey, Massachusetts, Illinois, and others). The deduction shown here applies to your
          federal return only. Verify your state's conformity before applying to a state return.
        </p>
      </Callout>

      <Callout kind="info" title="ℹ Where This Flows on the Return">
        <p>
          The QBI deduction flows to <strong>Form 1040 Line 13</strong>. It is a below-the-line
          deduction — it reduces <em>taxable</em> income but not AGI. It is available whether you
          itemize (Schedule A) or take the standard deduction.
        </p>
        {aboveThreshold && (
          <p>
            <strong>Above threshold:</strong> Use Form 8995-A (not the simplified Form 8995). You will
            need W-2 wages and UBIA from each partnership's Section 199A statement (attached to Box 20 S).
          </p>
        )}
      </Callout>
    </div>
  )
}
