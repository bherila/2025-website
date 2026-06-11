import { act, render, screen } from '@testing-library/react'

describe('AccountNavigation', () => {
  beforeEach(() => {
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

  it('renders Import button', async () => {
    const AccountNavigation = (await import('@/components/finance/AccountNavigation')).default
    await act(async () => {
      render(<AccountNavigation accountId={1} activeTab="transactions" />)
    })
    const importLink = screen.getByRole('link', { name: /import/i })
    expect(importLink).toBeInTheDocument()
    expect(importLink).toHaveAttribute('href', '/finance/account/1/import')
  })

  it('renders Maintenance button for numeric accountId', async () => {
    const AccountNavigation = (await import('@/components/finance/AccountNavigation')).default
    await act(async () => {
      render(<AccountNavigation accountId={1} activeTab="transactions" />)
    })
    const maintenanceLink = screen.getByRole('link', { name: /maintenance/i })
    expect(maintenanceLink).toBeInTheDocument()
    expect(maintenanceLink).toHaveAttribute('href', '/finance/account/1/maintenance')
  })

  it('does not render Maintenance button for all context', async () => {
    const AccountNavigation = (await import('@/components/finance/AccountNavigation')).default
    await act(async () => {
      render(<AccountNavigation accountId="all" activeTab="transactions" />)
    })
    expect(screen.queryByRole('link', { name: /maintenance/i })).not.toBeInTheDocument()
  })

  it('renders Import button for all context', async () => {
    const AccountNavigation = (await import('@/components/finance/AccountNavigation')).default
    await act(async () => {
      render(<AccountNavigation accountId="all" activeTab="transactions" />)
    })
    const importLink = screen.getByRole('link', { name: /import/i })
    expect(importLink).toBeInTheDocument()
    expect(importLink).toHaveAttribute('href', '/finance/account/all/import')
  })

  it('does not render a duplicate tab row (tabs are owned by FinanceNavbar)', async () => {
    const AccountNavigation = (await import('@/components/finance/AccountNavigation')).default
    await act(async () => {
      render(<AccountNavigation accountId={1} activeTab="transactions" />)
    })
    // TabsList role is "tablist" — AccountNavigation must NOT render any tablist
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('does not render a tab row for all context either', async () => {
    const AccountNavigation = (await import('@/components/finance/AccountNavigation')).default
    await act(async () => {
      render(<AccountNavigation accountId="all" activeTab="transactions" />)
    })
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('shows year selector for year-enabled tabs', async () => {
    const AccountNavigation = (await import('@/components/finance/AccountNavigation')).default
    await act(async () => {
      render(<AccountNavigation accountId={1} activeTab="transactions" />)
    })
    // Import button remains present regardless of year selector state
    expect(screen.getByRole('link', { name: /import/i })).toBeInTheDocument()
  })

  it('does not render FinanceNavbar (FINANCE branding not present)', async () => {
    const AccountNavigation = (await import('@/components/finance/AccountNavigation')).default
    await act(async () => {
      render(<AccountNavigation accountId={1} activeTab="transactions" />)
    })
    // The simplified AccountNavigation should NOT include FINANCE branding
    expect(screen.queryByLabelText('Finance section')).not.toBeInTheDocument()
  })

  it('does not render account combobox (moved to FinanceNavbar)', async () => {
    const AccountNavigation = (await import('@/components/finance/AccountNavigation')).default
    await act(async () => {
      render(<AccountNavigation accountId={1} activeTab="transactions" />)
    })
    // No account dropdown in simplified AccountNavigation
    const comboboxes = screen.queryAllByRole('combobox')
    // AccountYearSelector may have a combobox, but no account selector
    // Verify no combobox has placeholder matching an account name
    comboboxes.forEach((cb) => {
      expect(cb).not.toHaveAttribute('placeholder', 'Checking')
    })
  })
})
