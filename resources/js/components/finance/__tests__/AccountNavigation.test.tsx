import { act, render, screen, waitFor } from '@testing-library/react'

describe('AccountNavigation account dropdown', () => {
  beforeEach(() => {
    // Mock fetch to return finance accounts
    ;(window as any).fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/finance/accounts')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            assetAccounts: [
              { acct_id: 1, acct_name: 'Checking' },
              { acct_id: 2, acct_name: 'Savings' },
            ],
            liabilityAccounts: [],
            retirementAccounts: [],
            activeChartAccounts: [],
          }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    // Mock sessionStorage for year selection
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: jest.fn(() => null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
      writable: true,
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('renders account combobox with account name', async () => {
    const AccountNavigation = (await import('@/components/finance/AccountNavigation')).default
    await act(async () => {
      render(
        <AccountNavigation
          accountId={1}
          accountName="Checking"
          activeTab="transactions"
        />
      )
    })

    // The breadcrumb should show the account combobox
    const combobox = screen.getByRole('combobox')
    expect(combobox).toBeInTheDocument()
    expect(combobox).toHaveAttribute('placeholder', 'Checking')
    expect(combobox).toHaveAttribute('aria-haspopup', 'listbox')
  })

  it('fetches accounts list on mount', async () => {
    const AccountNavigation = (await import('@/components/finance/AccountNavigation')).default
    await act(async () => {
      render(
        <AccountNavigation
          accountId={1}
          accountName="Checking"
          activeTab="transactions"
        />
      )
    })

    await waitFor(() => {
      expect((window as any).fetch).toHaveBeenCalledWith('/api/finance/accounts')
    })
  })

  it('shows Accounts breadcrumb link pointing to accounts list', async () => {
    const AccountNavigation = (await import('@/components/finance/AccountNavigation')).default
    await act(async () => {
      render(
        <AccountNavigation
          accountId={1}
          accountName="Checking"
          activeTab="transactions"
        />
      )
    })

    const accountsLink = screen.getByRole('link', { name: /^Accounts$/i })
    expect(accountsLink).toHaveAttribute('href', '/finance/accounts')
  })

  it('shows the active tab name in breadcrumb page element', async () => {
    const AccountNavigation = (await import('@/components/finance/AccountNavigation')).default
    await act(async () => {
      render(
        <AccountNavigation
          accountId={1}
          accountName="Checking"
          activeTab="duplicates"
        />
      )
    })

    // The breadcrumb-page element shows the active tab name
    const breadcrumbPage = document.querySelector('[data-slot="breadcrumb-page"]')
    expect(breadcrumbPage).toHaveTextContent('Duplicates')
  })
})
