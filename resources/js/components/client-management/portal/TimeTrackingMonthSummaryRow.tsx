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
  catchUpHoursBilled?: number | undefined
  finalBalance?: number | undefined
}

export default function TimeTrackingMonthSummaryRow({
  openingAvailable,
  preAgreementHoursApplied,
  hoursWorked,
  hoursUsedFromRollover,
  excessHours,
  negativeBalance,
  remainingPool,
  catchUpHoursBilled,
  finalBalance,
}: TimeTrackingMonthSummaryRowProps) {
  return (
    <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs text-muted-foreground">
      {typeof openingAvailable === 'number' && (
        <SummaryTile
          title="Monthly Retainer"
          size="small"
        >
          {formatHours(openingAvailable)}
        </SummaryTile>
      )}

      {typeof preAgreementHoursApplied === 'number' && preAgreementHoursApplied !== 0 && (
        <SummaryTile
          title={preAgreementHoursApplied > 0 ? 'Carried In' : 'Carried In (Offset)'}
          kind={preAgreementHoursApplied > 0 ? 'blue' : 'red'}
          size="small"
        >
          {formatHours(Math.abs(preAgreementHoursApplied))}
        </SummaryTile>
      )}

      <SummaryTile title="Hours Worked" size="small">
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

      {/* Catch-up billed this month */}
      {typeof catchUpHoursBilled === 'number' && catchUpHoursBilled > 0 && (
        <SummaryTile title="Catch-up Hours Billed" kind="red" size="small">
          {formatHours(catchUpHoursBilled)}
        </SummaryTile>
      )}

      {/* Month-end balance: prefer explicit finalBalance prop, otherwise derive from remainingPool/negativeBalance */}
      {(() => {
        const fb = typeof finalBalance === 'number'
          ? finalBalance
          : (typeof remainingPool === 'number' ? remainingPool : (typeof negativeBalance === 'number' ? -negativeBalance : undefined));

        if (typeof fb === 'number') {
          if (fb > 0) {
            return (
              <SummaryTile title="Hours Available This Month" kind="green" size="small">
                {formatHours(fb)}
              </SummaryTile>
            )
          }

          if (fb < 0) {
            return (
              <SummaryTile title="Negative Balance (Carried Forward)" kind="red" size="small">
                {formatHours(Math.abs(fb))}
              </SummaryTile>
            )
          }

          return (
            <SummaryTile title="Balance" size="small">
              {formatHours(0)}
            </SummaryTile>
          )
        }

        return null
      })()}
    </div>
  )
}
