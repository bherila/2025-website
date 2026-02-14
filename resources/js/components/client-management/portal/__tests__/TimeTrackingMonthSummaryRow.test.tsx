import { render, screen } from '@testing-library/react'
import TimeTrackingMonthSummaryRow from '@/components/client-management/portal/TimeTrackingMonthSummaryRow'

describe('TimeTrackingMonthSummaryRow', () => {
  it('shows Catch-up Hours Billed and Remaining Balance on invoice page (including zero values)', () => {
    render(
      <TimeTrackingMonthSummaryRow
        displayMode="invoice_page"
        openingAvailable={10}
        carriedInHours={0.5}
        currentMonthHours={1.5}
        hoursWorked={2}
        hoursUsedFromRollover={0}
        catchUpHoursBilled={0}
        negativeBalance={0}
        remainingPool={0}
        startingUnusedHours={0}
        startingNegativeHours={0}
      />
    )

    // Titles present
    expect(screen.getByText('Catch-up Hours Billed')).toBeInTheDocument()
    expect(screen.getByText('Remaining Balance')).toBeInTheDocument()

    // Values displayed as 0:00 for zeros
    const catchUpTitleDiv = screen.getByText('Catch-up Hours Billed')
    const catchUpTileRoot = catchUpTitleDiv.closest('div')!.parentElement!
    expect(catchUpTileRoot).toHaveTextContent('0:00')

    const remainingTitleDiv = screen.getByText('Remaining Balance')
    const remainingTileRoot = remainingTitleDiv.closest('div')!.parentElement!
    expect(remainingTileRoot).toHaveTextContent('0:00')
  })
})
