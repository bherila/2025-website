import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { fetchWrapper } from '@/fetchWrapper'

import { FinanceCommandPalette } from '../FinanceCommandPalette'
import { setFinanceCommandPaletteOpen } from '../FinanceCommandRegistry'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: { get: jest.fn() },
}))

const accountsResponse = {
  assetAccounts: [
    { acct_id: 1, acct_name: 'Checking', acct_number: '1111222233334444' },
    { acct_id: 2, acct_name: 'Savings', acct_number: '5555666677778888' },
  ],
  liabilityAccounts: [],
  retirementAccounts: [
    { acct_id: 3, acct_name: 'Brokerage', acct_number: '9999000011112222' },
  ],
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(fetchWrapper.get as jest.Mock).mockResolvedValue(accountsResponse)
  window.history.replaceState({}, '', '/finance/account/1/transactions?year=2025')
  setFinanceCommandPaletteOpen(false)
})

describe('FinanceCommandPalette', () => {
  it('opens from Cmd/Ctrl+K and searches account navigation rows', async () => {
    render(<FinanceCommandPalette currentAccountId={1} />)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })

    expect(screen.getByPlaceholderText('Jump to an account, tool, or page…')).toBeInTheDocument()
    await waitFor(() => expect(fetchWrapper.get).toHaveBeenCalledWith('/api/finance/accounts'))

    fireEvent.change(screen.getByPlaceholderText('Jump to an account, tool, or page…'), {
      target: { value: 'checking transactions' },
    })
    expect(await screen.findByText('Checking → Transactions')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Jump to an account, tool, or page…'), {
      target: { value: 'all transactions' },
    })
    expect(screen.getByText('All Accounts → Transactions')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Jump to an account, tool, or page…'), {
      target: { value: 'brokerage lots' },
    })
    expect(screen.getByText('Brokerage → Lots')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Jump to an account, tool, or page…'), {
      target: { value: 'all duplicates' },
    })
    expect(screen.queryByText('All Accounts → Duplicates')).not.toBeInTheDocument()
  })

  it.each([
    ['tax preview', 'Tax Preview'],
    ['documents', 'Documents'],
    ['rsu', 'RSU'],
    ['payslips', 'Payslips'],
    ['tags', 'Tags'],
    ['accounts', 'Accounts'],
    ['config', 'Config'],
    ['calculators', 'Calculators'],
  ])('searches finance top-tool row %s', (query, label) => {
    render(<FinanceCommandPalette />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })

    fireEvent.change(screen.getByPlaceholderText('Jump to an account, tool, or page…'), { target: { value: query } })

    expect(screen.getByText(label)).toBeInTheDocument()
  })
})
