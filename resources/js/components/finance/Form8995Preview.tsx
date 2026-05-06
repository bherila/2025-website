'use client'

import { Callout, fmtAmt, FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { Form8995Lines } from '@/types/finance/tax-return'
import type { Form8995Facts } from '@/types/generated/tax-preview-facts'

export type { Form8995Lines } from '@/types/finance/tax-return'

interface Form8995PreviewProps {
  taxFacts?: Form8995Facts | null
  selectedYear: number
  isMarried?: boolean
}

export function form8995FactsToLines(facts: Form8995Facts): Form8995Lines {
  return {
    entries: facts.entities.map((entity) => ({
      label: entity.label,
      qbiIncome: entity.qbiIncome,
      w2Wages: 0,
      reitDividends: entity.reitDividends,
      ptpIncome: entity.ptpIncome,
      isSstb: entity.isSstb,
      sectionNotes: entity.sectionNotes ?? '',
      qbiComponent: entity.qbiComponent,
    })),
    totalQBI: facts.totalQbi,
    totalQBIComponent: facts.totalQbiComponent,
    totalIncome: facts.taxableIncomeBeforeQbi,
    estimatedTaxableIncome: facts.taxableIncomeBeforeQbi,
    stdDedApplied: 0,
    taxableIncomeCap: facts.taxableIncomeCap,
    estimatedDeduction: facts.deduction,
    aboveThreshold: facts.aboveThreshold,
    thresholdSingle: facts.thresholdSingle,
    thresholdMFJ: facts.thresholdMarriedFilingJointly,
  }
}

export default function Form8995Preview({ taxFacts, selectedYear, isMarried = false }: Form8995PreviewProps) {
  const computed = taxFacts ? form8995FactsToLines(taxFacts) : null

  if (!computed) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        QBI facts are still loading.
      </div>
    )
  }

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
        No Section 199A / QBI data found in backend tax facts.
        <br />
        Review K-1 documents, Schedule C activity, or qualified Schedule E activity to see Form 8995 analysis.
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
        <Callout kind="warn" title="Income Exceeds Phase-In Threshold — W-2 Wage Limitation May Apply">
          <p>
            Estimated taxable income (<strong>{fmtAmt(estimatedTaxableIncome, 0)}</strong>) exceeds the{' '}
            {isMarried ? 'MFJ' : 'single'} threshold of{' '}
            <strong>{fmtAmt(threshold, 0)}</strong> for {selectedYear}. Use Form 8995-A.
            The deduction may be limited to the greater of 50% of W-2 wages or 25% of W-2 wages + 2.5% of UBIA.
            W-2 wages are reported in the Section 199A Statement A attached to Box 20 Code Z.
          </p>
        </Callout>
      ) : (
        <Callout kind="good" title="Below Threshold — Simplified Calculation Applies">
          <p>
            Estimated taxable income (<strong>{fmtAmt(estimatedTaxableIncome, 0)}</strong>) is below the{' '}
            {isMarried ? 'MFJ' : 'single'} threshold of{' '}
            <strong>{fmtAmt(threshold, 0)}</strong>. Use Form 8995 (simplified).
            No W-2 wage or UBIA limitation — deduction is simply 20% × QBI, capped at 20% of taxable income.
          </p>
        </Callout>
      )}

      {/* Per-partnership breakdown */}
      <FormBlock title="Per-Entity QBI Breakdown">
        {entries.map((entry, i) => (
          <div key={i} className="space-y-0.5 pb-2 border-b last:border-0 last:pb-0">
            <FormLine label={`${entry.label} — QBI income`} value={entry.qbiIncome} />
            {entry.isSstb && (
              <FormLine label={`${entry.label} — SSTB`} raw="Specified Service Trade or Business — deduction phases out above threshold" />
            )}
            {entry.w2Wages !== 0 && (
              <FormLine label={`${entry.label} — W-2 wages (Form 8995-A, Line 4)`} value={entry.w2Wages} />
            )}
            {(entry.reitDividends !== 0) && (
              <FormLine label={`${entry.label} — §199A REIT dividends`} value={entry.reitDividends} />
            )}
            {(entry.ptpIncome !== 0) && (
              <FormLine label={`${entry.label} — Qualified PTP income`} value={entry.ptpIncome} />
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
        <FormLine label="Taxable income before QBI deduction" value={estimatedTaxableIncome} />
        <FormLine
          label="Less: net capital gain"
          value={-(taxFacts?.netCapitalGain ?? 0)}
        />
        <FormLine label="Taxable income less net capital gain" value={taxFacts?.taxableIncomeLessNetCapitalGain ?? estimatedTaxableIncome} />
        <FormLine label="20% cap" value={taxableIncomeCap} />
        <FormLine
          label="Note"
          raw={`Backend facts estimate taxable income for ${selectedYear} ${isMarried ? 'MFJ' : 'Single'} before applying the QBI deduction.`}
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
      <Callout kind="warn" title="QBI Deduction Does NOT Reduce Net Investment Income (NIIT)">
        <p>
          The QBI deduction reduces regular taxable income (Form 1040 Line 15) but has{' '}
          <strong>no effect on Net Investment Income</strong> (Form 8960). Passive K-1 income remains
          fully subject to the 3.8% NIIT regardless of the QBI deduction. See the Form 1116 tab for
          NIIT estimates.
        </p>
      </Callout>

      <Callout kind="good" title="QBI Deduction Is Allowed for AMT (Form 6251)">
        <p>
          Post-TCJA, the Sec. 199A deduction is fully allowed for Alternative Minimum Tax purposes.
          Do <strong>not</strong> add it back on Form 6251.
        </p>
      </Callout>

      <Callout kind="warn" title="State Conformity Varies — Check Your State">
        <p>
          Many states do <strong>not</strong> conform to the Sec. 199A deduction (California, New York,
          New Jersey, Massachusetts, Illinois, and others). The deduction shown here applies to your
          federal return only. Verify your state's conformity before applying to a state return.
        </p>
      </Callout>

      <Callout kind="info" title="Where This Flows on the Return">
        <p>
          The QBI deduction flows to <strong>Form 1040 Line 13</strong>. It is a below-the-line
          deduction — it reduces <em>taxable</em> income but not AGI. It is available whether you
          itemize (Schedule A) or take the standard deduction.
        </p>
        {aboveThreshold && (
          <p>
            <strong>Above threshold:</strong> Use Form 8995-A (not the simplified Form 8995). You will
            need W-2 wages and UBIA from each partnership's Section 199A Statement A (attached to Box 20 Code Z).
          </p>
        )}
      </Callout>
    </div>
  )
}
