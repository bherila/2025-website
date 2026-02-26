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
  startingUnusedHours?: number | undefined
  startingNegativeHours?: number | undefined
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
  startingUnusedHours,
  startingNegativeHours,
  finalBalance,
  displayMode = 'time_page',
}: TimeTrackingMonthSummaryRowProps) {
  // For invoice page, show breakdown if available
  const isInvoicePage = displayMode === 'invoice_page' || (carriedInHours !== undefined || currentMonthHours !== undefined);
  
  return (
    <div className="mt-3 grid grid-cols-2 md:grid-cols-6 gap-3 text-xs text-muted-foreground">
      {/* Show monthly retainer if available (prioritize monthlyRetainer prop, then openingAvailable) */}
      {(typeof monthlyRetainer === 'number' || typeof openingAvailable === 'number') && (
        <SummaryTile
          title="Monthly Retainer"
          size="small"
        >
          {formatHours((monthlyRetainer ?? openingAvailable)!)}
        </SummaryTile>
      )}

      {/* Show negative offset if > 0 */}
      {typeof negativeOffsetThisMonth === 'number' && negativeOffsetThisMonth > 0 && (
        <SummaryTile
          title="Prev Month Overage (Subtracted)"
          kind="red"
          size="small"
        >
          {formatHours(negativeOffsetThisMonth)}
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
      {/* Show catch-up hours on both invoice and time pages when present */}
      {typeof catchUpHoursBilled === 'number' && catchUpHoursBilled > 0 && (
        <SummaryTile title="Catch-up Hours Billed" kind="red" size="small">
          {formatHours(catchUpHoursBilled)}
        </SummaryTile>
      )}
      {/* On invoice page, always show (even 0:00) */}
      {displayMode === 'invoice_page' && typeof catchUpHoursBilled === 'number' && catchUpHoursBilled === 0 && (
        <SummaryTile title="Catch-up Hours Billed" kind="red" size="small">
          {formatHours(0)}
        </SummaryTile>
      )}

      {/* Month-end balance: prefer explicit finalBalance prop, otherwise derive from remainingPool/negativeBalance */}
      {(() => {
        let fb = finalBalance;
        
        if (fb === undefined) {
          if (remainingPool !== undefined || negativeBalance !== undefined) {
            fb = (remainingPool || 0) - (negativeBalance || 0);
          } else if (displayMode === 'invoice_page' && (startingUnusedHours !== undefined || startingNegativeHours !== undefined)) {
            fb = (startingUnusedHours || 0) - (startingNegativeHours || 0);
          }
        }

        if (typeof fb === 'number') {
          const results = [];

          // Show Remaining Balance tile for invoice page even when zero (display 0:00)
          if (fb >= 0) {
            results.push(
              <SummaryTile key="remaining" title="Remaining Balance" kind="green" size="small">
                {formatHours(fb)}
              </SummaryTile>
            )
          } else {
            // Negative balance (carried forward)
            results.push(
              <SummaryTile key="negative" title="Negative Balance (Carried Forward)" kind="red" size="small">
                {formatHours(Math.abs(fb))}
              </SummaryTile>
            )
          }

          // On invoice page, if we have starting balances for the NEXT month that differ from the work period end state, show them as well
          // On time page, show next month balance when available from invoice data
          if (startingUnusedHours !== undefined || startingNegativeHours !== undefined) {
            const nextFb = (startingUnusedHours || 0) - (startingNegativeHours || 0);
            if (displayMode === 'invoice_page' && nextFb !== fb) {
              if (nextFb >= 0) {
                results.push(
                  <SummaryTile key="next-remaining" title="Next Month Start Balance" kind="green" size="small">
                    {formatHours(nextFb)}
                  </SummaryTile>
                );
              } else {
                results.push(
                  <SummaryTile key="next-negative" title="Next Month Start Overage" kind="red" size="small">
                    {formatHours(Math.abs(nextFb))}
                  </SummaryTile>
                );
              }
            } else if (displayMode === 'time_page') {
              if (nextFb >= 0) {
                results.push(
                  <SummaryTile key="next-remaining" title="Next Month Start Balance" kind="green" size="small">
                    {formatHours(nextFb)}
                  </SummaryTile>
                );
              } else {
                results.push(
                  <SummaryTile key="next-negative" title="Next Month Start Overage" kind="red" size="small">
                    {formatHours(Math.abs(nextFb))}
                  </SummaryTile>
                );
              }
            }
          }

          return <>{results}</>;
        }

        return null
      })()}
    </div>
  )
}
