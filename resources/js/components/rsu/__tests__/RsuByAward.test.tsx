import { render, screen } from '@testing-library/react'

import { RsuByAward } from '@/components/rsu/RsuByAward'
import type { IAward } from '@/types/finance'

const past = '2020-01-01'
const future = '2099-01-01'

const awards: IAward[] = [
  { award_id: 'A1', vest_date: past, share_count: 10, vest_price: 100, grant_price: 50, symbol: 'X' },
  { award_id: 'A1', vest_date: future, share_count: 10, vest_price: 100, grant_price: 50, symbol: 'X' },
  { award_id: 'A2', vest_date: past, share_count: 5, vest_price: 200, grant_price: 100, symbol: 'X' },
  { award_id: 'A2', vest_date: past, share_count: 5, vest_price: 200, grant_price: 100, symbol: 'X' },
]

describe('RsuByAward', () => {
  it('renders all award groups by default', () => {
    render(<RsuByAward rsu={awards} />)
    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.getByText('A2')).toBeInTheDocument()
  })

  it('hides fully-vested awards when hideFullyVested is true', () => {
    render(<RsuByAward rsu={awards} hideFullyVested />)
    expect(screen.getByText('A1')).toBeInTheDocument() // has a future vest
    expect(screen.queryByText('A2')).not.toBeInTheDocument() // entirely in the past
  })

  it('still shows awards with at least one unvested row even when most rows are vested', () => {
    render(<RsuByAward rsu={[awards[0]!, awards[1]!]} hideFullyVested />)
    expect(screen.getByText('A1')).toBeInTheDocument()
  })

  it('does not include virtual rows in aggregate totals', () => {
    render(<RsuByAward rsu={[
      { award_id: 'A1', vest_date: future, share_count: 10, vest_price: 100, grant_price: 50 },
      { award_id: 'A1', vest_date: future, share_count: 90, vest_price: 100, grant_price: 50, isVirtual: true },
    ]} />)

    expect(screen.getByText((_, element) => element?.textContent === '0/10')).toBeInTheDocument()
    expect(screen.queryByText((_, element) => element?.textContent === '0/100')).not.toBeInTheDocument()
  })
})
