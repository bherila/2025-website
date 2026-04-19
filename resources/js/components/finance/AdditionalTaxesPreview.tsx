'use client'

import { Callout, fmtAmt, FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { CapitalLossCarryoverLines, Form461Lines, Form8959Lines, Form8960Lines, Schedule2Lines } from '@/types/finance/tax-return'

interface AdditionalTaxesPreviewProps {
  schedule2?: Schedule2Lines | undefined
  form8959?: Form8959Lines | undefined
  form8960?: Form8960Lines | undefined
  capitalLossCarryover?: CapitalLossCarryoverLines | undefined
  form461?: Form461Lines | undefined
}

export default function AdditionalTaxesPreview({ schedule2, form8959, form8960, capitalLossCarryover, form461 }: AdditionalTaxesPreviewProps) {
  const hasContent = form8959?.additionalTax || form8960?.niitTax || capitalLossCarryover?.hasCarryover || form461
  if (!hasContent) return null

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Additional Taxes &amp; Planning Items</h2>
        <p className="text-xs text-muted-foreground">
          These amounts flow to Schedule 2 and Form 1040 Lines 17–23.
        </p>
      </div>

      {/* Schedule 2 — Additional Taxes rollup */}
      {schedule2 && schedule2.totalAdditionalTaxes > 0 && (
        <FormBlock title="Schedule 2 — Additional Taxes (Form 1040 Line 17)">
          {schedule2.altMinimumTax > 0 && (
            <FormLine label="Line 2 — Alternative Minimum Tax (Form 6251)" value={schedule2.altMinimumTax} />
          )}
          {schedule2.additionalMedicareTax > 0 && (
            <FormLine label="Line 11 — Additional Medicare Tax (Form 8959)" value={schedule2.additionalMedicareTax} />
          )}
          {schedule2.niit > 0 && (
            <FormLine label="Line 12 — Net Investment Income Tax (Form 8960)" value={schedule2.niit} />
          )}
          <FormTotalLine label="Total additional taxes → Form 1040 Line 17" value={schedule2.totalAdditionalTaxes} double />
          <FormLine label="Note" raw="AMT (Line 2) not computed — shown as $0. See Form 6251 if applicable." />
        </FormBlock>
      )}

      {/* Form 8959 — Additional Medicare Tax */}
      {form8959 && form8959.additionalTax > 0 && (
        <FormBlock title="Form 8959 — Additional Medicare Tax (0.9%)">
          <FormLine label="W-2 wages (Box 1)" value={form8959.wages} />
          <FormLine
            label={`Less: threshold (${fmtAmt(form8959.threshold, 0)} — ${form8959.threshold === 200_000 ? 'Single/MFS/HOH' : 'MFJ'})`}
            value={-form8959.threshold}
          />
          <FormLine label="Wages above threshold" value={form8959.excessWages} />
          <FormTotalLine label="Additional Medicare Tax (0.9% × excess) — Schedule 2 Line 11" value={form8959.additionalTax} double />
          <FormLine label="Note" raw="Withheld at source (W-2 Box 6) does not include the 0.9% — you may owe this at filing unless employer withheld extra." />
        </FormBlock>
      )}

      {/* Form 8960 — Net Investment Income Tax */}
      {form8960 && form8960.niitTax > 0 && (
        <FormBlock title="Form 8960 — Net Investment Income Tax (NIIT, 3.8%)">
          {form8960.components.map((c, i) => (
            <FormLine key={i} label={c.label} value={c.amount} />
          ))}
          <FormTotalLine label="Net Investment Income (Line 12)" value={form8960.netInvestmentIncome} />
          <FormLine label="Modified AGI (estimated)" value={form8960.magi} />
          <FormLine label={`Less: threshold (${fmtAmt(form8960.threshold, 0)} — ${form8960.threshold === 200_000 ? 'Single/MFS/HOH' : 'MFJ'})`} value={-form8960.threshold} />
          <FormLine label="Excess MAGI over threshold" value={form8960.magiExcess} />
          <FormLine label="NIIT base (lesser of NII or MAGI excess)" value={Math.min(form8960.netInvestmentIncome, form8960.magiExcess)} />
          <FormTotalLine label="NIIT (3.8% × base) — Schedule 2 Line 12" value={form8960.niitTax} double />
          <FormLine label="Note" raw="NIIT is not reduced by the QBI deduction (Form 8995) or the foreign tax credit (Form 1116)." />
        </FormBlock>
      )}

      {form8960 && form8960.niitTax === 0 && form8960.magi > 0 && (
        <FormBlock title="Form 8960 — Net Investment Income Tax (NIIT)">
          <FormLine label="MAGI (estimated)" value={form8960.magi} />
          <FormLine label={`Threshold (${form8960.threshold === 200_000 ? 'Single' : 'MFJ'})`} value={form8960.threshold} />
          <FormLine label="NIIT" raw="$0 — MAGI does not exceed the threshold" />
        </FormBlock>
      )}

      {/* Form 461 — Excess Business Loss */}
      {form461 && (
        <FormBlock title={`Form 461 — Excess Business Loss Limitation (${form461.isTriggered ? '⚠ EBL Applies' : '✓ Within Limit'})`}>
          <FormLine label="Aggregate trade/business income (loss)" value={form461.aggregateBusinessIncomeLoss} />
          <FormLine label={`EBL limit (${fmtAmt(form461.eblLimit, 0)} — ${form461.eblLimit > 305_000 ? 'MFJ' : 'Single'})`} value={form461.eblLimit} />
          {form461.isTriggered ? (
            <>
              <FormTotalLine label="Excess business loss — disallowed this year" value={-form461.excessBusinessLoss} double />
              <FormLine label="Disallowed loss converts to NOL carryforward" raw="Enter on Schedule 1 Line 8p — reduces future year ordinary income" />
              <Callout kind="warn" title="⚠ Excess Business Loss Applies — Schedule 1 Line 8p">
                <p>
                  Business losses of <strong>{fmtAmt(form461.aggregateBusinessIncomeLoss, 0)}</strong> exceed
                  the EBL limit of <strong>{fmtAmt(form461.eblLimit, 0)}</strong>. The excess{' '}
                  <strong>{fmtAmt(form461.excessBusinessLoss, 0)}</strong> is disallowed this year and
                  converts to a Net Operating Loss (NOL) carryforward. Enter as a positive number on
                  Schedule 1 (Form 1040) Line 8p.
                </p>
              </Callout>
            </>
          ) : (
            <FormLine
              label="EBL status"
              raw={form461.aggregateBusinessIncomeLoss >= 0
                ? '✓ Net business income — EBL does not apply'
                : `✓ Loss of ${fmtAmt(Math.abs(form461.aggregateBusinessIncomeLoss), 0)} is within the ${fmtAmt(form461.eblLimit, 0)} limit`}
            />
          )}
        </FormBlock>
      )}

      {/* Capital Loss Carryover */}
      {capitalLossCarryover?.hasCarryover && (
        <FormBlock title="Capital Loss Carryover to Next Year">
          <FormLine label="Net short-term capital gain/(loss) this year" value={capitalLossCarryover.netShortTerm} />
          <FormLine label="Net long-term capital gain/(loss) this year" value={capitalLossCarryover.netLongTerm} />
          <FormLine label="Combined net capital gain/(loss)" value={capitalLossCarryover.combined} />
          <FormLine label="Applied to ordinary income this year (max $3,000)" value={capitalLossCarryover.appliedToOrdinaryIncome} />
          {capitalLossCarryover.shortTermCarryover > 0 && (
            <FormLine label="Short-term capital loss carryover to next year" value={-capitalLossCarryover.shortTermCarryover} />
          )}
          {capitalLossCarryover.longTermCarryover > 0 && (
            <FormLine label="Long-term capital loss carryover to next year" value={-capitalLossCarryover.longTermCarryover} />
          )}
          <FormTotalLine label="Total capital loss carryforward" value={-capitalLossCarryover.totalCarryover} double />
          <FormLine label="Enter on next year's Schedule D" raw="Retains ST/LT character — offsets future capital gains dollar-for-dollar" />
          <Callout kind="info" title="ℹ Capital Loss Carryforward Planning">
            <p>
              This carryforward offsets future capital gains with no time limit.
              A short-term carryforward offsets short-term gains first (taxed as ordinary income at up to 37%),
              making it more valuable dollar-for-dollar than a long-term carryforward.
            </p>
          </Callout>
        </FormBlock>
      )}

      {capitalLossCarryover && !capitalLossCarryover.hasCarryover && capitalLossCarryover.combined < 0 && (
        <FormBlock title="Capital Loss — Fully Applied This Year">
          <FormLine label="Net capital loss" value={capitalLossCarryover.combined} />
          <FormLine label="Applied to ordinary income (max $3,000)" value={capitalLossCarryover.appliedToOrdinaryIncome} />
          <FormLine label="Carryover to next year" raw="$0 — loss fully absorbed" />
        </FormBlock>
      )}
    </div>
  )
}
