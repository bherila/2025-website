import React from 'react'
import SummaryTile from '@/components/ui/summary-tile'
import { formatHours } from '@/lib/formatHours'

interface TimeTrackingMonthSummaryRowProps {
  monthlyRetainer?: number | undefined
  negativeOffsetThisMonth?: number | undefined
  openingAvailable?: number | undefined
  preAgreementHoursApplied?: number | undefined
  carriedInHours?: number | undefined
  currentMonthHours?: number | undefined
  hoursWorked: number
  hoursUsedFromRollover?: number | undefined
  excessHours?: number | undefined
  negativeBalance?: number | undefined
  remainingPool?: number | undefined
  catchUpHoursBilled?: number | undefined
  finalBalance?: number | undefined
  // Display mode: 'time_page' or 'invoice_page'
  displayMode?: 'time_page' | 'invoice_page'
}

export default function TimeTrackingMonthSummaryRow({
  monthlyRetainer,
  negativeOffsetThisMonth,
  openingAvailable,
  preAgreementHoursApplied,
  carriedInHours,
  currentMonthHours,
  hoursWorked,
  hoursUsedFromRollover,
  excessHours,
  negativeBalance,
  remainingPool,
  catchUpHoursBilled,
  finalBalance,
  displayMode = 'time_page',
}: TimeTrackingMonthSummaryRowProps) {
  // For invoice page, show breakdown if available
  const isInvoicePage = displayMode === 'invoice_page' || (carriedInHours !== undefined || currentMonthHours !== undefined);
  
  return (
    <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs text-muted-foreground">
      {/* On Time page: Show monthly retainer separately if available */}
      {displayMode === 'time_page' && typeof monthlyRetainer === 'number' && (
        <SummaryTile
          title="Monthly Retainer"
          size="small"
        >
          {formatHours(monthlyRetainer)}
        </SummaryTile>
      )}

      {/* On Time page: Show negative offset separately if > 0 */}
      {displayMode === 'time_page' && typeof negativeOffsetThisMonth === 'number' && negativeOffsetThisMonth > 0 && (
        <SummaryTile
          title="Prev Month Overage (Subtracted)"
          kind="red"
          size="small"
        >
          {formatHours(negativeOffsetThisMonth)}
        </SummaryTile>
      )}

      {/* On Invoice page or when openingAvailable is provided without separate retainer */}
      {(displayMode === 'invoice_page' || !monthlyRetainer) && typeof openingAvailable === 'number' && (
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

      {/* Show breakdown on invoice page if data available */}
      {isInvoicePage && typeof carriedInHours === 'number' && carriedInHours > 0 && (
        <SummaryTile title="Carried-In Hours (Prior Months)" kind="blue" size="small">
          {formatHours(carriedInHours)}
        </SummaryTile>
      )}

      {isInvoicePage && typeof currentMonthHours === 'number' && currentMonthHours > 0 && (
        <SummaryTile title="Current Month Hours" size="small">
          {formatHours(currentMonthHours)}
        </SummaryTile>
      )}

      {/* Show total hours worked if not showing breakdown, or as fallback */}
      {!isInvoicePage && (
        <SummaryTile title="Hours Worked" size="small">
          {formatHours(hoursWorked)}
        </SummaryTile>
      )}

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
              <SummaryTile title="Remaining Balance" kind="green" size="small">
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

          // Don't show balance tile if it's exactly 0
          return null
        }

        return null
      })()}
    </div>
  )
}
