import React from 'react'
import SummaryTile from '@/components/ui/summary-tile'
import { formatHours } from '@/lib/formatHours'

interface TimeTrackingMonthSummaryRowProps {
  openingAvailable?: number | undefined
  preAgreementHoursApplied?: number | undefined
  hoursWorked: number
  hoursUsedFromRollover?: number | undefined
  excessHours?: number | undefined
  negativeBalance?: number | undefined
  remainingPool?: number | undefined
}

export default function TimeTrackingMonthSummaryRow({
  openingAvailable,
  preAgreementHoursApplied,
  hoursWorked,
  hoursUsedFromRollover,
  excessHours,
  negativeBalance,
  remainingPool,
}: TimeTrackingMonthSummaryRowProps) {
  return (
    <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs text-muted-foreground">
      {typeof openingAvailable === 'number' && (
        <SummaryTile
          title="Monthly Retainer"
          kind="green"
          size="small"
        >
          {formatHours(openingAvailable)}
        </SummaryTile>
      )}

      {typeof preAgreementHoursApplied === 'number' && preAgreementHoursApplied > 0 && (
        <SummaryTile
          title="Carried In"
          kind="blue"
          size="small"
        >
          {formatHours(preAgreementHoursApplied)}
        </SummaryTile>
      )}

      <SummaryTile title="Hours Worked (Prior period)" kind="blue" size="small">
        {formatHours(hoursWorked)}
      </SummaryTile>

      {typeof hoursUsedFromRollover === 'number' && hoursUsedFromRollover > 0 && (
        <SummaryTile title="Rollover Used" size="small">
          {formatHours(hoursUsedFromRollover)}
        </SummaryTile>
      )}

      {typeof excessHours === 'number' && excessHours > 0 && (
        <SummaryTile title="Overage (Billed)" kind="red" size="small">
          {formatHours(excessHours)}
        </SummaryTile>
      )}

      {typeof negativeBalance === 'number' && negativeBalance > 0 ? (
        <SummaryTile title="Overage (Carried Forward)" kind="red" size="small">
          {formatHours(negativeBalance)}
        </SummaryTile>
      ) : (
        typeof remainingPool === 'number' && (
          <SummaryTile title="Unused (Carried Forward)" size="small">
            {formatHours(Math.max(0, remainingPool))}
          </SummaryTile>
        )
      )}
    </div>
  )
}
