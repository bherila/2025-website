import { act, render, screen } from '@testing-library/react'

describe('FinanceNavbar', () => {
  afterEach(() => {
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

  it('renders all section links', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar activeSection="accounts" />)
    })

    // Check nav links by href
    expect(document.querySelector('a[href="/finance/accounts"]')).toBeInTheDocument()
    expect(document.querySelector('a[href="/finance/all-transactions"]')).toBeInTheDocument()
    expect(document.querySelector('a[href="/finance/schedule-c"]')).toBeInTheDocument()
    expect(document.querySelector('a[href="/finance/rsu"]')).toBeInTheDocument()
    expect(document.querySelector('a[href="/finance/payslips"]')).toBeInTheDocument()

    // Verify the Transactions link text (renamed from "All Transactions")
    const transactionsLink = document.querySelector('a[href="/finance/all-transactions"]')
    expect(transactionsLink).toHaveTextContent('Transactions')
  })

  it('marks the active section with aria-current="page"', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar activeSection="rsu" />)
    })

    // Find the navigation menu link (not the breadcrumb page)
    const rsuLinks = screen.getAllByRole('link', { name: 'RSU' })
    const navRsuLink = rsuLinks.find(el => el.getAttribute('href') === '/finance/rsu')
    expect(navRsuLink).toBeDefined()
    expect(navRsuLink).toHaveAttribute('aria-current', 'page')

    // Other nav links should not be aria-current
    const accountsLink = document.querySelector('a[href="/finance/accounts"]')
    expect(accountsLink).not.toHaveAttribute('aria-current')
  })

  it('shows Manage Tags link for all authenticated users (not admin-only)', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar activeSection="accounts" />)
    })
    const manageTagsLink = screen.getByRole('link', { name: 'Manage Tags' })
    expect(manageTagsLink).toBeInTheDocument()
    expect(manageTagsLink).toHaveAttribute('href', '/finance/tags')
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

  it('highlights Manage Tags when activeSection is tags', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar activeSection="tags" />)
    })
    const manageTagsLink = screen.getByRole('link', { name: 'Manage Tags' })
    expect(manageTagsLink).toHaveAttribute('aria-current', 'page')
  })

  it('is non-sticky (no positioning classes)', async () => {
    const FinanceNavbar = (await import('@/components/finance/FinanceNavbar')).default
    await act(async () => {
      render(<FinanceNavbar activeSection="accounts" />)
    })
    // The nav bar should NOT have sticky, fixed, or absolute positioning
    const navBar = screen.getByLabelText('Finance section').closest('.border-b')
    expect(navBar?.className).not.toMatch(/\b(sticky|fixed|absolute)\b/)
  })

  it('backwards-compatible re-export from FinanceSubNav', async () => {
    const mod = await import('@/components/finance/FinanceSubNav')
    expect(mod.default).toBeDefined()
    expect(mod.FINANCE_SECTIONS).toBeDefined()
  })
})
