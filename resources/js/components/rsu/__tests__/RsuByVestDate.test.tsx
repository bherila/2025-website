import { render, screen } from '@testing-library/react'

import { RsuByVestDate } from '@/components/rsu/RsuByVestDate'
import type { IAward } from '@/types/finance'

describe('RsuByVestDate', () => {
  it('does not include virtual rows in aggregate totals', () => {
    const awards: IAward[] = [
      { award_id: 'A1', vest_date: '2099-01-01', share_count: 10, vest_price: 100, grant_price: 50 },
      { award_id: 'Projected A1', vest_date: '2099-01-01', share_count: 90, vest_price: 100, grant_price: 50, isVirtual: true },
    ]

    render(<RsuByVestDate rsu={awards} />)

    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.queryByText('100')).not.toBeInTheDocument()
  })
})
