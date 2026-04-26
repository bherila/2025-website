'use client'

import currency from 'currency.js'

import type { FormRenderProps } from '@/components/finance/tax-preview/formRegistry'
import { Callout, FormBlock, FormLine, FormSubLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { fin_payslip } from '@/components/payslip/payslipDbCols'

/**
 * Solo 401(k) / SE 401(k) contribution limits by tax year.
 * - employeeDeferral: §402(g) elective deferral cap
 * - catchUpAge50: additional allowed for age 50+
 * - overallCap: §415(c) total annual additions cap (employee + employer, excl. catch-up)
 *
 * Sources: IRS Notice 2023-75 (2024 limits), IRS Notice 2024-80 (2025 limits).
 */
export const SE_401K_LIMITS: Record<number, { employeeDeferral: number; catchUpAge50: number; overallCap: number }> = {
  2024: { employeeDeferral: 23_000, catchUpAge50: 7_500, overallCap: 69_000 },
  2025: { employeeDeferral: 23_500, catchUpAge50: 7_500, overallCap: 70_000 },
}

const DEFAULT_SE_401K_YEAR = 2025

function getLimitsForYear(year: number) {
  return SE_401K_LIMITS[year] ?? SE_401K_LIMITS[DEFAULT_SE_401K_YEAR]!
}

export interface Se401kInputs {
  year: number
  /** Net earnings from self-employment before SE tax reduction — Schedule SE line 6. */
  netEarningsFromSE: number
  /** Deductible half of SE tax (line 13). Reduces the compensation base. */
  deductibleSeTax: number
  /** W-2 employee pre-tax 401(k) already deferred this year (reduces remaining room). */
  w2EmployeePretaxDeferred: number
}

export interface Se401kLines {
  /** Compensation base = net SE earnings − deductible half of SE tax. */
  compensationBase: number
  /** Employee deferral room remaining for the year. */
  employeeDeferralRoom: number
  /** Maximum employer contribution (20% of compensationBase for Schedule C filers). */
  maxEmployerContribution: number
  /** Overall §415(c) cap minus W-2 deferrals already applied elsewhere. */
  overallCap: number
  /** Recommended contribution = min(employeeRoom + employerMax, overallCap). */
  recommendedContribution: number
  /** Year-specific limit block used for the calc. */
  limits: { employeeDeferral: number; catchUpAge50: number; overallCap: number }
}

/**
 * The Solo 401(k) employer contribution for a self-employed person is
 * effectively 20% of (net SE earnings − ½ SE tax), not 25% — the 25%
 * figure assumes gross W-2 wages. See IRS Pub 560 rate table.
 */
const EMPLOYER_CONTRIBUTION_RATE = 0.20

export function computeSe401k({
  year,
  netEarningsFromSE,
  deductibleSeTax,
  w2EmployeePretaxDeferred,
}: Se401kInputs): Se401kLines {
  const limits = getLimitsForYear(year)

  const compensationBase = Math.max(
    0,
    currency(netEarningsFromSE).subtract(deductibleSeTax).value,
  )

  const employeeDeferralRoom = Math.max(
    0,
    currency(limits.employeeDeferral).subtract(w2EmployeePretaxDeferred).value,
  )

  const maxEmployerContribution = currency(compensationBase, { precision: 2 })
    .multiply(EMPLOYER_CONTRIBUTION_RATE).value

  const overallCap = Math.max(
    0,
    currency(limits.overallCap).subtract(w2EmployeePretaxDeferred).value,
  )

  const rawCombined = currency(employeeDeferralRoom).add(maxEmployerContribution).value
  // Contribution cannot exceed either the §415(c) cap or the compensation base itself
  // (you can't contribute more than you earn).
  const recommendedContribution = Math.min(rawCombined, overallCap, compensationBase)

  return {
    compensationBase,
    employeeDeferralRoom,
    maxEmployerContribution,
    overallCap,
    recommendedContribution,
    limits,
  }
}

export default function WorksheetSE401k({ state }: FormRenderProps): React.ReactElement {
  const scheduleSE = state.taxReturn.scheduleSE
  const netEarningsFromSE = scheduleSE?.netEarningsFromSE ?? 0
  const deductibleSeTax = scheduleSE?.deductibleSeTax ?? 0

  // Sum pre-tax 401(k) already deferred on W-2 payslips for the selected year.
  const w2EmployeePretaxDeferred = state.payslips.reduce(
    (acc, row: fin_payslip) => acc.add(row.ps_401k_pretax ?? 0),
    currency(0),
  ).value

  const lines = computeSe401k({
    year: state.year,
    netEarningsFromSE,
    deductibleSeTax,
    w2EmployeePretaxDeferred,
  })

  if (netEarningsFromSE === 0) {
    return (
      <Callout kind="info" title="No Schedule SE net earnings detected">
        <p>
          The Solo 401(k) worksheet uses self-employment earnings from Schedule SE. Populate
          Schedule SE (via a K-1 Box 14 or Schedule C net profit) to compute contribution room.
        </p>
      </Callout>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        IRS Pub 560 — Solo 401(k) for Schedule C / partnership self-employment earnings.
        Employer contribution uses the 20% rate (not 25%) because the base already excludes
        the employer's share. Age 50+ catch-up of ${lines.limits.catchUpAge50.toLocaleString()}{' '}
        is shown for reference but not added automatically.
      </p>

      <FormBlock title="Compensation base">
        <FormLine label="Schedule SE net earnings (line 6)" value={netEarningsFromSE} />
        <FormLine label="Less: deductible half of SE tax (Schedule 1 line 15)" value={-deductibleSeTax} />
        <FormTotalLine label="Compensation base for 401(k) contributions" value={lines.compensationBase} />
      </FormBlock>

      <FormBlock title="Employee deferral — §402(g)">
        <FormLine
          label={`${state.year} employee deferral limit`}
          value={lines.limits.employeeDeferral}
        />
        <FormLine label="Already deferred via W-2 (ps_401k_pretax)" value={-w2EmployeePretaxDeferred} />
        <FormTotalLine label="Remaining employee deferral room" value={lines.employeeDeferralRoom} />
        <FormSubLine text={`Add $${lines.limits.catchUpAge50.toLocaleString()} catch-up if age 50 or older.`} />
      </FormBlock>

      <FormBlock title="Employer contribution — 20% of compensation base">
        <FormLine label="Compensation base × 20%" value={lines.maxEmployerContribution} />
      </FormBlock>

      <FormBlock title="Overall §415(c) cap">
        <FormLine label={`${state.year} overall annual additions cap`} value={lines.limits.overallCap} />
        <FormLine label="Less: W-2 deferrals counted toward the cap" value={-w2EmployeePretaxDeferred} />
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
