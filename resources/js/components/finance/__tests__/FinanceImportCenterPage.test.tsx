import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'
import React from 'react'

import FinanceImportCenterPage from '../FinanceImportCenterPage'

// ── permission helper ─────────────────────────────────────────────────────────

function setPermissions(permissions: string[], isAdmin = false) {
  document.getElementById('app-initial-data')?.remove()
  const el = document.createElement('script')
  el.id = 'app-initial-data'
  el.type = 'application/json'
  el.textContent = JSON.stringify({ isAdmin, permissions })
  document.body.appendChild(el)
}

function setAdmin() {
  setPermissions([], true)
}

// ── mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/components/MainTitle', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}))

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className, ...props }: React.ComponentProps<'div'>) => (
    <div className={className} {...props}>
      {children}
    </div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
}))

// ── tests ─────────────────────────────────────────────────────────────────────

describe('FinanceImportCenterPage', () => {
  afterEach(() => {
    document.getElementById('app-initial-data')?.remove()
    jest.clearAllMocks()
  })

  it('renders the Import Center heading', () => {
    setAdmin()
    render(<FinanceImportCenterPage />)
    expect(screen.getByRole('heading', { name: 'Import Center' })).toBeInTheDocument()
  })

  it('renders all import cards for a fully-permissioned user', () => {
    setAdmin()
    render(<FinanceImportCenterPage />)

    expect(screen.getByTestId('import-card-transactions')).toBeInTheDocument()
    expect(screen.getByTestId('import-card-tax-documents')).toBeInTheDocument()
    expect(screen.getByTestId('import-card-payslips')).toBeInTheDocument()
    expect(screen.getByTestId('import-card-rsu')).toBeInTheDocument()
    expect(screen.getByTestId('import-card-k1-basis')).toBeInTheDocument()
    expect(screen.getByTestId('import-card-carryovers')).toBeInTheDocument()
    expect(screen.getByTestId('import-card-career-comparison')).toBeInTheDocument()
  })

  it('links transactions card to /finance/account/all/import', () => {
    setAdmin()
    render(<FinanceImportCenterPage />)

    const card = screen.getByTestId('import-card-transactions')
    const links = card.querySelectorAll('a')
    expect(Array.from(links).some((a) => a.getAttribute('href') === '/finance/account/all/import')).toBe(true)
  })

  it('links tax-documents card to /finance/documents', () => {
    setAdmin()
    render(<FinanceImportCenterPage />)

    const card = screen.getByTestId('import-card-tax-documents')
    const links = card.querySelectorAll('a')
    expect(Array.from(links).some((a) => a.getAttribute('href') === '/finance/documents')).toBe(true)
  })

  it('links payslips card to /finance/payslips', () => {
    setAdmin()
    render(<FinanceImportCenterPage />)

    const card = screen.getByTestId('import-card-payslips')
    const links = card.querySelectorAll('a')
    expect(Array.from(links).some((a) => a.getAttribute('href') === '/finance/payslips')).toBe(true)
  })

  it('links rsu card to /finance/rsu', () => {
    setAdmin()
    render(<FinanceImportCenterPage />)

    const card = screen.getByTestId('import-card-rsu')
    const links = card.querySelectorAll('a')
    expect(Array.from(links).some((a) => a.getAttribute('href') === '/finance/rsu')).toBe(true)
  })

  it('links carryovers card to /finance/tax-preview (existing manual-entry surface)', () => {
    setAdmin()
    render(<FinanceImportCenterPage />)

    const card = screen.getByTestId('import-card-carryovers')
    const links = card.querySelectorAll('a')
    expect(Array.from(links).some((a) => a.getAttribute('href') === '/finance/tax-preview')).toBe(true)
  })

  it('links career-comparison card to /financial-planning/career-comparison', () => {
    setAdmin()
    render(<FinanceImportCenterPage />)

    const card = screen.getByTestId('import-card-career-comparison')
    const links = card.querySelectorAll('a')
    expect(
      Array.from(links).some((a) => a.getAttribute('href') === '/financial-planning/career-comparison'),
    ).toBe(true)
  })

  it('hides transactions card when finance.transactions.import permission is missing', () => {
    setPermissions(['finance.tax-documents.view', 'finance.payslips.view', 'finance.rsu.manage', 'finance.accounts.detail', 'finance.tax-preview.view'])
    render(<FinanceImportCenterPage />)

    expect(screen.queryByTestId('import-card-transactions')).not.toBeInTheDocument()
    // Other cards still visible
    expect(screen.getByTestId('import-card-tax-documents')).toBeInTheDocument()
  })

  it('hides payslips card when payslip permissions are missing', () => {
    setPermissions(['finance.transactions.import', 'finance.tax-documents.view', 'finance.rsu.manage', 'finance.accounts.detail', 'finance.tax-preview.view'])
    render(<FinanceImportCenterPage />)

    expect(screen.queryByTestId('import-card-payslips')).not.toBeInTheDocument()
    expect(screen.getByTestId('import-card-transactions')).toBeInTheDocument()
  })

  it('hides rsu card when finance.rsu.manage permission is missing', () => {
    setPermissions(['finance.transactions.import', 'finance.tax-documents.view', 'finance.payslips.view', 'finance.accounts.detail', 'finance.tax-preview.view'])
    render(<FinanceImportCenterPage />)

    expect(screen.queryByTestId('import-card-rsu')).not.toBeInTheDocument()
    expect(screen.getByTestId('import-card-transactions')).toBeInTheDocument()
  })

  it('hides carryovers card when finance.tax-preview.view permission is missing', () => {
    setPermissions(['finance.transactions.import', 'finance.tax-documents.view', 'finance.payslips.view', 'finance.rsu.manage', 'finance.accounts.detail'])
    render(<FinanceImportCenterPage />)

    expect(screen.queryByTestId('import-card-carryovers')).not.toBeInTheDocument()
    expect(screen.getByTestId('import-card-transactions')).toBeInTheDocument()
  })

  it('always shows career-comparison card regardless of permissions', () => {
    setPermissions([])
    render(<FinanceImportCenterPage />)

    expect(screen.getByTestId('import-card-career-comparison')).toBeInTheDocument()
  })

  it('shows no-cards message when no relevant permissions and only career card remains', () => {
    // Career comparison has no permission gate so it always shows — no empty state
    setPermissions([])
    render(<FinanceImportCenterPage />)

    expect(screen.queryByTestId('no-cards-message')).not.toBeInTheDocument()
    expect(screen.getByTestId('import-card-career-comparison')).toBeInTheDocument()
  })
})
