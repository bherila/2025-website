'use client'

import currency from 'currency.js'

import type { FormRenderProps } from '@/components/finance/tax-preview/formRegistry'
import { Callout, FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'

/**
 * AMT Exemption Phaseout Worksheet (Form 6251 line 5).
 *
 * Base exemption is reduced by 25% of the amount by which AMTI exceeds
 * the phaseout threshold, floored at zero. All inputs are already present
 * on `Form6251Lines` — this worksheet just surfaces the math.
 */
export default function WorksheetAmtExemption({ state }: FormRenderProps): React.ReactElement {
  const f = state.taxReturn.form6251

  if (!f) {
    return (
      <Callout kind="info" title="Form 6251 has not been computed yet">
        <p>
          The AMT exemption phaseout uses AMTI from Form 6251. Navigate to the Form 6251 column to
          populate it, then return here.
        </p>
      </Callout>
    )
  }

  const filingStatusLabel = f.filingStatus === 'mfj' ? 'Married Filing Jointly' : 'Single'
  const overThreshold = f.amti > f.exemptionPhaseoutThreshold

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Form 6251 line 5 — {filingStatusLabel} · phaseout begins at 25% of the amount by which AMTI
        exceeds the threshold, floored at $0.
      </p>

      <FormBlock title="Base exemption (before phaseout)">
        <FormLine boxRef="" label="Full AMT exemption for filing status" value={f.exemption} />
        <FormLine boxRef="" label="AMTI — Form 6251 line 4" value={f.amti} />
        <FormLine boxRef="" label="Phaseout threshold" value={f.exemptionPhaseoutThreshold} />
      </FormBlock>

      <FormBlock title="Phaseout calculation">
        <FormLine
          boxRef=""
          label="AMTI in excess of threshold"
          value={Math.max(0, currency(f.amti).subtract(f.exemptionPhaseoutThreshold).value)}
        />
        <FormLine boxRef="" label="× 25% reduction rate" raw="25%" />
        <FormLine boxRef="" label="Exemption reduction (floored at zero)" value={f.exemptionReduction} />
        <FormTotalLine label="Final exemption → Form 6251 line 5" value={f.exemptionBase} double />
      </FormBlock>

      {!overThreshold && (
        <Callout kind="good" title="Full exemption applies">
          <p>AMTI is below the phaseout threshold — the base exemption flows through unchanged.</p>
        </Callout>
      )}

      {overThreshold && f.exemptionBase === 0 && (
        <Callout kind="warn" title="Exemption fully phased out">
          <p>
            AMTI is high enough that the exemption is completely eliminated. AMT is computed on the
            full AMTI starting from dollar one.
          </p>
        </Callout>
      )}
    </div>
  )
}
