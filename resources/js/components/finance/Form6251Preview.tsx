'use client'

import { Callout, fmtAmt, FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { Form6251Lines } from '@/types/finance/tax-return'

export type { Form6251Lines } from '@/types/finance/tax-return'

interface Form6251PreviewProps {
  form6251: Form6251Lines | undefined
  selectedYear: number
}

export default function Form6251Preview({ form6251, selectedYear }: Form6251PreviewProps) {
  if (!form6251) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Form 6251 data is not available.
      </div>
    )
  }

  const line2aLabel = form6251.line2aSource === 'salt_deduction'
    ? 'Line 2a — State/local tax deduction addback (Schedule A taxes)'
    : form6251.line2aSource === 'standard_deduction'
      ? 'Line 2a — Standard deduction addback'
      : 'Line 2a — Taxes / standard deduction addback'

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Form 6251 — Alternative Minimum Tax (AMT)</h2>
        <p className="text-xs text-muted-foreground">
          Estimated AMT computation for tax year {selectedYear}. Line 11 flows to Schedule 2 Line 2 and Form 1040 Line 17.
        </p>
      </div>

      {form6251.sourceEntries.length > 0 && (
        <FormBlock title="K-1 Box 17 Adjustments">
          {form6251.sourceEntries.map((entry, index) => (
            <FormLine
              key={`${entry.label}-${entry.code}-${index}`}
              label={`${entry.label} — Box 17${entry.code} → Line ${entry.line}`}
              value={entry.amount}
            />
          ))}
        </FormBlock>
      )}

      <FormBlock title="Part I — Alternative Minimum Taxable Income">
        <FormLine label="Line 1 — Taxable income" value={form6251.line1TaxableIncome} />
        {form6251.line2aTaxesOrStandardDeduction !== 0 && (
          <FormLine label={line2aLabel} value={form6251.line2aTaxesOrStandardDeduction} />
        )}
        {form6251.line2cInvestmentInterest !== 0 && (
          <FormLine label="Line 2c — Investment interest adjustment" value={form6251.line2cInvestmentInterest} />
        )}
        {form6251.line2dDepletion !== 0 && (
          <FormLine label="Line 2d — Depletion" value={form6251.line2dDepletion} />
        )}
        {form6251.line2kDispositionOfProperty !== 0 && (
          <FormLine label="Line 2k — Disposition of property" value={form6251.line2kDispositionOfProperty} />
        )}
        {form6251.line2lPost1986Depreciation !== 0 && (
          <FormLine label="Line 2l — Post-1986 depreciation" value={form6251.line2lPost1986Depreciation} />
        )}
        {form6251.line2mPassiveActivities !== 0 && (
          <FormLine label="Line 2m — Passive activities" value={form6251.line2mPassiveActivities} />
        )}
        {form6251.line2nLossLimitations !== 0 && (
          <FormLine label="Line 2n — Loss limitations" value={form6251.line2nLossLimitations} />
        )}
        {form6251.line2tIntangibleDrillingCosts !== 0 && (
          <FormLine label="Line 2t — Intangible drilling costs" value={form6251.line2tIntangibleDrillingCosts} />
        )}
        {form6251.line3OtherAdjustments !== 0 && (
          <FormLine label="Line 3 — Other adjustments" value={form6251.line3OtherAdjustments} />
        )}
        <FormLine label="Total adjustments" value={form6251.adjustmentTotal} />
        <FormTotalLine label="Line 4 — Alternative minimum taxable income (AMTI)" value={form6251.amti} />
      </FormBlock>

      <FormBlock title="Part II — AMT">
        <FormLine label="Line 5 — Exemption amount before phaseout" value={form6251.exemptionBase} />
        <FormLine label={`Exemption phaseout threshold (${form6251.filingStatus === 'mfj' ? 'MFJ' : 'Single'})`} value={form6251.exemptionPhaseoutThreshold} />
        {form6251.exemptionReduction > 0 && (
          <FormLine label="Exemption reduction (25% of AMTI over threshold)" value={-form6251.exemptionReduction} />
        )}
        <FormTotalLine label="Line 5 — Allowed AMT exemption" value={form6251.exemption} />
        <FormLine label="Line 6 — AMT base after exemption" value={form6251.amtTaxBase} />
        <FormLine label={`26% / 28% split threshold (${selectedYear})`} value={form6251.amtRateSplitThreshold} />
        <FormLine label="Line 7 — AMT before foreign tax credit" value={form6251.amtBeforeForeignCredit} />
        {form6251.line8AmtForeignTaxCredit > 0 && (
          <FormLine label="Line 8 — AMT foreign tax credit" value={-form6251.line8AmtForeignTaxCredit} />
        )}
        <FormLine label="Line 9 — Tentative minimum tax" value={form6251.tentativeMinTax} />
        <FormLine label="Line 10 — Regular tax after credits" value={form6251.regularTaxAfterCredits} />
        <FormTotalLine label="Line 11 — Alternative minimum tax" value={form6251.amt} double />
      </FormBlock>

      {form6251.amt > 0 ? (
        <Callout kind="warn" title="⚠ AMT liability estimated">
          <p>
            Tentative minimum tax of <strong>{fmtAmt(form6251.tentativeMinTax, 0)}</strong> exceeds regular tax after credits of{' '}
            <strong>{fmtAmt(form6251.regularTaxAfterCredits, 0)}</strong>, producing AMT of{' '}
            <strong>{fmtAmt(form6251.amt, 0)}</strong>.
          </p>
        </Callout>
      ) : (
        <Callout kind="good" title="✓ No AMT estimated">
          <p>
            Tentative minimum tax does not exceed regular tax after credits, so Form 6251 line 11 is{' '}
            <strong>{fmtAmt(0, 0)}</strong>.
          </p>
        </Callout>
      )}

      {form6251.requiresStatementReview && (
        <Callout kind="info" title="ℹ Attached-statement review recommended">
          <ul className="list-disc pl-5 space-y-1">
            {form6251.manualReviewReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  )
}
