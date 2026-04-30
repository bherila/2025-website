'use client'

import { Callout, FormBlock, FormLine, FormSubLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { Se401kInputs, Se401kLines } from '@/lib/planning/solo401k'
import { computeSe401k } from '@/lib/planning/solo401k'

interface SoloSE401kFormProps {
  inputs: Se401kInputs
  onChange?: (next: Se401kInputs) => void
  readOnly?: boolean
}

export default function SoloSE401kForm({ inputs, readOnly = false }: SoloSE401kFormProps): React.ReactElement {
  const lines: Se401kLines = computeSe401k(inputs)

  if (inputs.netEarningsFromSE === 0) {
    return (
      <Callout kind="info" title="No Schedule SE net earnings entered">
        <p>
          Enter self-employment net earnings above to compute Solo 401(k) contribution room.
        </p>
      </Callout>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        IRS Pub 560 — Solo 401(k) for Schedule C / partnership self-employment earnings.
        Employer contribution uses the 20% rate (not 25%) because the base already excludes
        the employer&apos;s share. Age 50+ catch-up of ${lines.limits.catchUpAge50.toLocaleString()}{' '}
        is shown for reference but not added automatically.
      </p>

      <FormBlock title="Compensation base">
        <FormLine label="Schedule SE net earnings (line 6)" value={inputs.netEarningsFromSE} />
        <FormLine label="Less: deductible half of SE tax (Schedule 1 line 15)" value={-inputs.deductibleSeTax} />
        <FormTotalLine label="Compensation base for 401(k) contributions" value={lines.compensationBase} />
      </FormBlock>

      <FormBlock title="Employee deferral — §402(g)">
        <FormLine
          label={`${inputs.year} employee deferral limit`}
          value={lines.limits.employeeDeferral}
        />
        <FormLine label="Already deferred via W-2" value={-inputs.w2EmployeePretaxDeferred} />
        <FormTotalLine label="Remaining employee deferral room" value={lines.employeeDeferralRoom} />
        <FormSubLine text={`Add $${lines.limits.catchUpAge50.toLocaleString()} catch-up if age 50 or older.`} />
      </FormBlock>

      <FormBlock title="Employer contribution — 20% of compensation base">
        <FormLine label="Compensation base × 20%" value={lines.maxEmployerContribution} />
      </FormBlock>

      <FormBlock title="Overall §415(c) cap">
        <FormLine label={`${inputs.year} overall annual additions cap`} value={lines.limits.overallCap} />
        <FormLine label="Less: W-2 deferrals counted toward the cap" value={-inputs.w2EmployeePretaxDeferred} />
        <FormTotalLine label="Remaining §415(c) room" value={lines.overallCap} />
      </FormBlock>

      <FormTotalLine
        label="Recommended Solo 401(k) contribution (→ Schedule 1 line 16)"
        value={lines.recommendedContribution}
        double
      />

      {lines.recommendedContribution === lines.overallCap && lines.overallCap > 0 && (
        <Callout kind="info" title="§415(c) cap is binding">
          <p>The combined employee + employer contribution is limited by the overall annual-additions cap.</p>
        </Callout>
      )}
    </div>
  )
}
