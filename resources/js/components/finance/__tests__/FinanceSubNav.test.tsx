import { act, render, screen, waitFor } from '@testing-library/react'

describe('FinanceNavbar', () => {
  beforeEach(() => {
    // Mock fetch for account loading
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
          }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
    const el = document.getElementById('app-initial-data')
    if (el) el.remove()
  })

  it('renders FINANCE branding', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar activeSection="accounts" />)
    })
    expect(screen.getByLabelText('Finance section')).toBeInTheDocument()
    expect(screen.getByLabelText('Finance section').textContent).toBe('Finance')
  })

  it('renders right-side section links', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar activeSection="accounts" />)
    })

    expect(document.querySelector('a[href="/finance/tax-preview"]')).toBeInTheDocument()
    expect(document.querySelector('a[href="/finance/rsu"]')).toBeInTheDocument()
    expect(document.querySelector('a[href="/finance/payslips"]')).toBeInTheDocument()
    expect(document.querySelector('a[href="/finance/tags"]')).toBeInTheDocument()
    expect(document.querySelector('a[href="/finance/accounts"]')).toBeInTheDocument()
  })

  it('marks the active section with aria-current="page"', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar activeSection="rsu" />)
    })

    const rsuLinks = screen.getAllByRole('link', { name: 'RSU' })
    const navRsuLink = rsuLinks.find((el) => el.getAttribute('href') === '/finance/rsu')
    expect(navRsuLink).toBeDefined()
    expect(navRsuLink).toHaveAttribute('aria-current', 'page')

    const accountsLink = document.querySelector('a[href="/finance/accounts"]')
    expect(accountsLink).not.toHaveAttribute('aria-current')
  })

  it('shows Tags link for all authenticated users', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar activeSection="accounts" />)
    })
    const tagsLink = screen.getByRole('link', { name: 'Tags' })
    expect(tagsLink).toBeInTheDocument()
    expect(tagsLink).toHaveAttribute('href', '/finance/tags')
  })

  it('renders back button with link to homepage', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar activeSection="accounts" />)
    })
    const backLink = screen.getByRole('link', { name: 'Back to BWH' })
    expect(backLink).toBeInTheDocument()
    expect(backLink).toHaveAttribute('href', '/')
  })

  it('renders children below the nav bar', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(
        <FinanceNavbar activeSection="accounts">
          <div data-testid="child-content">Child content</div>
        </FinanceNavbar>,
      )
    })
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
  })

  it('highlights Tags when activeSection is tags', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar activeSection="tags" />)
    })
    const tagsLink = screen.getByRole('link', { name: 'Tags' })
    expect(tagsLink).toHaveAttribute('aria-current', 'page')
  })

  it('is non-sticky (no positioning classes)', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar activeSection="accounts" />)
    })
    const navBar = screen.getByLabelText('Finance section').closest('.border-b')
    expect(navBar?.className).not.toMatch(/\b(sticky|fixed|absolute)\b/)
  })

  it('backwards-compatible re-export from FinanceSubNav', async () => {
    const mod = await import('@/components/finance/FinanceSubNav')
    expect(mod.default).toBeDefined()
    expect(mod.FINANCE_SECTIONS).toBeDefined()
  })

  it('shows account combobox when accountId is provided', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar accountId={1} activeTab="transactions" />)
    })
    await waitFor(() => {
      const combobox = screen.getByRole('combobox')
      expect(combobox).toBeInTheDocument()
    })
  })

  it('does not show account combobox when accountId is undefined', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar activeSection="tax-preview" />)
    })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows account tabs when accountId is provided', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar accountId={1} activeTab="transactions" />)
    })
    expect(document.querySelector('a[href*="/transactions"]')).toBeInTheDocument()
    expect(document.querySelector('a[href*="/lots"]')).toBeInTheDocument()
  })

  it('disables Duplicates/Linker/Statements/Summary tabs when accountId is "all"', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar accountId="all" activeTab="transactions" />)
    })

    const disabledTabs = document.querySelectorAll('[aria-disabled="true"]')
    const labels = Array.from(disabledTabs).map((el) => el.textContent)
    expect(labels).toContain('Duplicates')
    expect(labels).toContain('Linker')
    expect(labels).toContain('Statements')
    expect(labels).toContain('Summary')
  })

  it('Transactions and Lots tabs are NOT disabled when accountId is "all"', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar accountId="all" activeTab="transactions" />)
    })

    const enabledTransactions = document.querySelector('a[href="/finance/account/all/transactions"]')
    const enabledLots = document.querySelector('a[href="/finance/account/all/lots"]')
    expect(enabledTransactions).not.toHaveAttribute('aria-disabled')
    expect(enabledLots).not.toHaveAttribute('aria-disabled')
  })
})
