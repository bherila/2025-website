import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { fetchWrapper } from '@/fetchWrapper'
import { setStoredYear } from '@/lib/financeRouteBuilder'

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
  window.sessionStorage.clear()
  // The palette gates account loading on finance.accounts.basic via hasPermission,
  // which fails closed without an app-initial-data node. Mark this test user admin.
  document.getElementById('app-initial-data')?.remove()
  const initialData = document.createElement('script')
  initialData.id = 'app-initial-data'
  initialData.type = 'application/json'
  initialData.textContent = JSON.stringify({ isAdmin: true })
  document.body.appendChild(initialData)
  ;(fetchWrapper.get as jest.Mock).mockResolvedValue(accountsResponse)
  window.history.replaceState({}, '', '/finance/account/1/transactions?year=2025')
  setFinanceCommandPaletteOpen(false)
})

function openPalette(): void {
  fireEvent.keyDown(window, { key: 'k', metaKey: true })
}

const flatAccounts = [
  ...accountsResponse.assetAccounts,
  ...accountsResponse.retirementAccounts,
]

describe('FinanceCommandPalette', () => {
  it('opens from Cmd/Ctrl+K and searches account navigation rows', async () => {
    render(<FinanceCommandPalette currentAccountId={1} />)

    openPalette()

    expect(screen.getByPlaceholderText('Jump to an account, tool, or page…')).toBeInTheDocument()
    await waitFor(() => expect(fetchWrapper.get).toHaveBeenCalledWith('/api/finance/accounts/basic'))

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
    openPalette()

    fireEvent.change(screen.getByPlaceholderText('Jump to an account, tool, or page…'), { target: { value: query } })

    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('uses the stored effective account year for non-transaction account pages', async () => {
    window.history.replaceState({}, '', '/finance/account/1/fees')
    setStoredYear(1, 2024)
    const onNavigate = jest.fn()
    render(
      <FinanceCommandPalette
        currentAccountId={1}
        activeTab="fees"
        accounts={flatAccounts}
        onNavigate={onNavigate}
      />,
    )

    openPalette()
    fireEvent.change(screen.getByPlaceholderText('Jump to an account, tool, or page…'), {
      target: { value: 'checking fees' },
    })
    fireEvent.click(await screen.findByText('Checking → Fees'))

    expect(onNavigate).toHaveBeenCalledWith('/finance/account/1/fees?year=2024')
    expect(fetchWrapper.get).not.toHaveBeenCalled()
  })

  it('syncs a replaceState URL year when the palette opens', async () => {
    window.history.replaceState({}, '', '/finance/account/1/fees?year=2025')
    const onNavigate = jest.fn()
    render(
      <FinanceCommandPalette
        currentAccountId={1}
        activeTab="fees"
        accounts={flatAccounts}
        onNavigate={onNavigate}
      />,
    )
    window.history.replaceState({}, '', '/finance/account/1/fees?year=2026')

    openPalette()
    fireEvent.change(screen.getByPlaceholderText('Jump to an account, tool, or page…'), {
      target: { value: 'savings lots' },
    })
    fireEvent.click(await screen.findByText('Savings → Lots'))

    expect(onNavigate).toHaveBeenCalledWith('/finance/account/2/lots?year=2026')
  })

  it('preserves explicit year=all for specific and all-account transaction links', async () => {
    window.history.replaceState({}, '', '/finance/account/1/transactions?year=all')
    const onNavigate = jest.fn()
    render(
      <FinanceCommandPalette
        currentAccountId={1}
        activeTab="transactions"
        accounts={flatAccounts}
        onNavigate={onNavigate}
      />,
    )

    openPalette()
    fireEvent.change(screen.getByPlaceholderText('Jump to an account, tool, or page…'), {
      target: { value: 'checking transactions' },
    })
    fireEvent.click(await screen.findByText('Checking → Transactions'))
    expect(onNavigate).toHaveBeenLastCalledWith('/finance/account/1/transactions?year=all')

    openPalette()
    fireEvent.change(screen.getByPlaceholderText('Jump to an account, tool, or page…'), {
      target: { value: 'all transactions' },
    })
    fireEvent.click(screen.getByText('All Accounts → Transactions'))
    expect(onNavigate).toHaveBeenLastCalledWith('/finance/account/all/transactions?year=all')
  })
})
