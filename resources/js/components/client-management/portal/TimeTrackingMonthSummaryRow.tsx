import React from 'react'
import SummaryTile from '@/components/ui/summary-tile'

interface TimeTrackingMonthSummaryRowProps {
  openingAvailable?: number | undefined
  preAgreementHoursApplied?: number | undefined
  hoursWorked: number
  hoursUsedFromRollover?: number | undefined
  excessHours?: number | undefined
  negativeBalance?: number | undefined
  remainingPool?: number | undefined
}

function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h}:${m.toString().padStart(2, '0')}`
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
          title="Contracted Time"
          kind="green"
          size="small"
        >
          {formatHours(openingAvailable)}
        </SummaryTile>
      )}
      
      {typeof preAgreementHoursApplied === 'number' && preAgreementHoursApplied > 0 && (
        <SummaryTile
          title="Carried in"
          kind="blue"
          size="small"
        >
          {formatHours(preAgreementHoursApplied)}
        </SummaryTile>
      )}
      
      <SummaryTile title="Worked" kind="blue" size="small">
        {formatHours(hoursWorked)}
      </SummaryTile>
      
      {typeof hoursUsedFromRollover === 'number' && hoursUsedFromRollover > 0 && (
        <SummaryTile title="Rollover Used" size="small">
          {formatHours(hoursUsedFromRollover)}
        </SummaryTile>
      )}
      
      {typeof excessHours === 'number' && excessHours > 0 && (
        <SummaryTile title="Overage (billed)" kind="red" size="small">
          {formatHours(excessHours)}
        </SummaryTile>
      )}
      
      {typeof negativeBalance === 'number' && negativeBalance > 0 ? (
        <SummaryTile title="Overage (carried forward)" kind="red" size="small">
          {formatHours(negativeBalance)}
        </SummaryTile>
      ) : (
        typeof remainingPool === 'number' && (
          <SummaryTile title="Remaining" size="small">
            {formatHours(Math.max(0, remainingPool))}
          </SummaryTile>
        )
      )}
    </div>
  )
}
