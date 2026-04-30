'use client'

import currency from 'currency.js'

import type { FormRenderProps } from '@/components/finance/tax-preview/formRegistry'
import { Callout } from '@/components/finance/tax-preview-primitives'
import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import { SoloSE401kForm } from '@/components/planning/SoloSE401k'

// Re-export for consumers that import from this module directly.
export type { Se401kInputs, Se401kLines } from '@/lib/planning/solo401k'
export { computeSe401k, SE_401K_LIMITS } from '@/lib/planning/solo401k'

export default function WorksheetSE401k({ state }: FormRenderProps): React.ReactElement {
  const scheduleSE = state.taxReturn.scheduleSE
  const netEarningsFromSE = scheduleSE?.netEarningsFromSE ?? 0
  const deductibleSeTax = scheduleSE?.deductibleSeTax ?? 0

  const w2EmployeePretaxDeferred = state.payslips.reduce(
    (acc, row: fin_payslip) => acc.add(row.ps_401k_pretax ?? 0),
    currency(0),
  ).value

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
    <SoloSE401kForm
      inputs={{
        year: state.year,
        netEarningsFromSE,
        deductibleSeTax,
        w2EmployeePretaxDeferred,
      }}
      readOnly
    />
  )
}
