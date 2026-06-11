import { act, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'

import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'
import { getCachedTransactions, syncCachedTransactions } from '@/services/transactionCache'

import TransactionsPage from '../TransactionsPage'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: { get: jest.fn(), delete: jest.fn() },
}))

jest.mock('@/components/finance/useFinanceTags', () => ({
  useFinanceTags: () => ({ tags: [] }),
}))

jest.mock('@/services/transactionCache', () => ({
  buildCacheKey: jest.fn(() => 'transactions:1'),
  getCachedTransactions: jest.fn(),
  syncCachedTransactions: jest.fn(),
}))

jest.mock('../TransactionsPageToolbar', () => ({
  TransactionsPageToolbar: () => <div data-testid="transactions-toolbar" />,
}))

jest.mock('../NewTransactionModal', () => ({
  __esModule: true,
  default: () => null,
}))

jest.mock('../transactionTable/TransactionsTable', () => ({
  __esModule: true,
  default: ({ data }: { data: AccountLineItem[] }): ReactElement => (
    <table>
      <tbody>
        {data.map((row) => (
          <tr key={row.t_id} data-testid={`transaction-${row.t_id}`} data-transaction-id={row.t_id}>
            <td>{row.t_description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}))

describe('TransactionsPage source highlight', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    window.history.pushState(null, '', '/finance/transactions#t_id=42')
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue([2025])
    ;(getCachedTransactions as jest.Mock).mockResolvedValue(null)
    ;(syncCachedTransactions as jest.Mock).mockResolvedValue({
      transactions: [
        {
          t_id: 42,
          t_account: 1,
          t_date: '2025-01-02',
          t_description: 'Target transaction',
          t_amt: 12.34,
        },
      ],
    })
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('renders the all-account import link in the blank state', async () => {
    ;(syncCachedTransactions as jest.Mock).mockResolvedValue({ transactions: [] })
    ;(getCachedTransactions as jest.Mock).mockResolvedValue([])
    window.history.pushState(null, '', '/finance/account/all/transactions')

    render(<TransactionsPage accountId="all" initialAvailableYears={[2025]} userId={7} />)

    const link = await screen.findByRole('link', { name: /import multi-account statement/i })
    expect(link).toHaveAttribute('href', '/finance/account/all/import')

    act(() => {
      jest.runOnlyPendingTimers()
    })
  })

  it('scrolls to and flashes the transaction row from the hash target', async () => {
    const scrollIntoView = jest.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView

    render(<TransactionsPage accountId={1} initialAvailableYears={[2025]} userId={7} />)

    const row = await screen.findByTestId('transaction-42')
    expect(row).toHaveTextContent('Target transaction')

    act(() => {
      jest.advanceTimersByTime(200)
    })

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
      expect(row).toHaveClass('scroll-highlight-flash')
    })

    act(() => {
      jest.advanceTimersByTime(3000)
    })

    expect(row).not.toHaveClass('scroll-highlight-flash')
  })
})
