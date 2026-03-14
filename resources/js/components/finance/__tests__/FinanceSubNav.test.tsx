import { act, render, screen } from '@testing-library/react'

describe('FinanceSubNav', () => {
  function injectInitialData(data: object) {
    const existing = document.getElementById('app-initial-data')
    if (existing) existing.remove()
    const script = document.createElement('script')
    script.id = 'app-initial-data'
    script.type = 'application/json'
    script.textContent = JSON.stringify(data)
    document.head.appendChild(script)
  }

  afterEach(() => {
    const el = document.getElementById('app-initial-data')
    if (el) el.remove()
  })

  it('renders FINANCE branding', async () => {
    injectInitialData({ isAdmin: false })
    const FinanceSubNav = (await import('@/components/finance/FinanceSubNav')).default
    await act(async () => {
      render(<FinanceSubNav activeSection="accounts" />)
    })
    expect(screen.getByLabelText('Finance section')).toBeInTheDocument()
    expect(screen.getByLabelText('Finance section').textContent).toBe('Finance')
  })

  it('renders all section links', async () => {
    injectInitialData({ isAdmin: false })
    const FinanceSubNav = (await import('@/components/finance/FinanceSubNav')).default
    await act(async () => {
      render(<FinanceSubNav activeSection="accounts" />)
    })

    // Check nav links by href (to distinguish from breadcrumb page items)
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
    injectInitialData({ isAdmin: false })
    const FinanceSubNav = (await import('@/components/finance/FinanceSubNav')).default
    await act(async () => {
      render(<FinanceSubNav activeSection="rsu" />)
    })

    // Find the navigation menu link (not the breadcrumb page which also has role=link)
    const rsuLinks = screen.getAllByRole('link', { name: 'RSU' })
    const navRsuLink = rsuLinks.find(el => el.getAttribute('href') === '/finance/rsu')
    expect(navRsuLink).toBeDefined()
    expect(navRsuLink).toHaveAttribute('aria-current', 'page')

    // Other nav links should not be aria-current
    const accountsLink = screen.getByRole('link', { name: 'Accounts' })
    expect(accountsLink).not.toHaveAttribute('aria-current')
  })

  it('does NOT show Manage Tags link when user is not admin', async () => {
    injectInitialData({ isAdmin: false })
    const FinanceSubNav = (await import('@/components/finance/FinanceSubNav')).default
    await act(async () => {
      render(<FinanceSubNav activeSection="accounts" />)
    })
    expect(screen.queryByRole('link', { name: 'Manage Tags' })).not.toBeInTheDocument()
  })

  it('shows Manage Tags link when user is admin', async () => {
    injectInitialData({ isAdmin: true })
    const FinanceSubNav = (await import('@/components/finance/FinanceSubNav')).default
    await act(async () => {
      render(<FinanceSubNav activeSection="accounts" />)
    })
    const manageTagsLink = screen.getByRole('link', { name: 'Manage Tags' })
    expect(manageTagsLink).toBeInTheDocument()
    expect(manageTagsLink).toHaveAttribute('href', '/finance/tags')
  })

  it('renders breadcrumb with Finance root link', async () => {
    injectInitialData({ isAdmin: false })
    const FinanceSubNav = (await import('@/components/finance/FinanceSubNav')).default
    await act(async () => {
      render(<FinanceSubNav activeSection="schedule-c" />)
    })
    const financeLink = screen.getByRole('link', { name: 'Finance' })
    expect(financeLink).toHaveAttribute('href', '/finance/accounts')
  })

  it('renders breadcrumb page for active section when no extra items', async () => {
    injectInitialData({ isAdmin: false })
    const FinanceSubNav = (await import('@/components/finance/FinanceSubNav')).default
    await act(async () => {
      render(<FinanceSubNav activeSection="payslips" />)
    })
    const page = document.querySelector('[data-slot="breadcrumb-page"]')
    expect(page).toHaveTextContent('Payslips')
  })

  it('renders children below the nav bar', async () => {
    injectInitialData({ isAdmin: false })
    const FinanceSubNav = (await import('@/components/finance/FinanceSubNav')).default
    await act(async () => {
      render(
        <FinanceSubNav activeSection="accounts">
          <div data-testid="child-content">Child content</div>
        </FinanceSubNav>,
      )
    })
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
  })
})
