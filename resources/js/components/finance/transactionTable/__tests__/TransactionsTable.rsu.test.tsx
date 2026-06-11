import { render, screen } from '@testing-library/react'

import TransactionsTable from '@/components/finance/transactionTable/TransactionsTable'
import type { AccountLineItem } from '@/data/finance/AccountLineItem'

const rows: AccountLineItem[] = [
  {
    t_id: 10,
    t_account: 1,
    t_date: '2026-01-01',
    t_description: 'Share deposit',
    t_amt: 0,
    t_account_balance: undefined,
    t_price: undefined,
    t_commission: undefined,
    t_fee: undefined,
    rsu_links: [{
      id: 3,
      link_type: 'share_deposit',
      transaction_id: 10,
      settlement_id: 7,
      status: 'confirmed',
    }],
  },
]

describe('TransactionsTable RSU badges', () => {
  it('shows an RSU indicator for rows with RSU links', () => {
    render(<TransactionsTable data={rows} useVirtualScroll={false} />)

    expect(screen.getByText('RSU')).toBeInTheDocument()
    expect(screen.getByTitle('1 RSU settlement link')).toBeInTheDocument()
  })
})
