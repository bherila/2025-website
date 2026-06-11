import '@testing-library/jest-dom'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import { fetchWrapper } from '@/fetchWrapper'

import FinanceHomePage from '../FinanceHomePage'

// ── mock dependencies ─────────────────────────────────────────────────────────

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
  },
}))

jest.mock('@/components/MainTitle', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    asChild,
    onClick,
    ...props
  }: React.ComponentProps<'button'> & { asChild?: boolean }) => {
    if (asChild) {
      return <>{children}</>
    }
    return (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    )
  },
}))

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: React.ComponentProps<'div'>) => <div className={className}>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

jest.mock('@/components/ui/alert', () => ({
  Alert: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <div role="alert" data-variant={variant}>
      {children}
    </div>
  ),
  AlertTitle: ({ children }: { children: React.ReactNode }) => <strong>{children}</strong>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Flat Select mock: Select provides onValueChange via context-like ref; SelectItem calls it directly.
const selectOnValueChange = { current: undefined as ((v: string) => void) | undefined }

jest.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode
    value?: string
    onValueChange?: (v: string) => void
  }) => {
    selectOnValueChange.current = onValueChange
    return (
      <div data-testid="year-select" data-value={value}>
        {children}
      </div>
    )
  },
  SelectTrigger: ({ children, 'aria-label': ariaLabel }: { children: React.ReactNode; 'aria-label'?: string }) => (
    <div aria-label={ariaLabel}>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <button type="button" data-value={value} onClick={() => selectOnValueChange.current?.(value)}>
      {children}
    </button>
  ),
}))

// ── fixtures ──────────────────────────────────────────────────────────────────

const mockGet = fetchWrapper.get as jest.Mock

function makeSummary(overrides: Partial<Parameters<typeof Object.assign>[0]> = {}) {
  return {
    year: 2025,
    availableYears: [2024, 2025],
    sections: [
      {
        id: 'accounts',
        status: 'ready',
        title: 'Accounts',
        summary: '3 accounts',
        counts: { accounts: 3 },
        actions: [],
      },
      {
        id: 'transactions',
        status: 'in_progress',
        title: 'Transactions',
        summary: '',
        actions: [],
      },
      {
        id: 'documents',
        status: 'needs_attention',
        title: 'Documents',
        summary: '2 missing',
        actions: [],
      },
    ],
    primaryActions: [
      { id: 'add-account', label: 'Add account', href: '/finance/accounts', kind: 'primary' },
      { id: 'import-tx', label: 'Import transactions', href: '/finance/account/all/import', kind: 'secondary' },
    ],
    warnings: [
      { id: 'warn-1', severity: 'warning', message: 'Missing account mappings', href: '/finance/accounts' },
    ],
    ...overrides,
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function renderAndWait(overrides = {}) {
  mockGet.mockResolvedValueOnce(makeSummary(overrides))
  let result: ReturnType<typeof render>
  await act(async () => {
    result = render(<FinanceHomePage />)
  })
  return result!
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('FinanceHomePage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    window.history.replaceState({}, '', '/finance')
  })

  it('renders loading state initially', () => {
    mockGet.mockReturnValue(new Promise(() => {})) // never resolves
    render(<FinanceHomePage />)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: 'Finance Dashboard' })).not.toBeInTheDocument()
  })

  it('renders setup checklist from API data', async () => {
    await renderAndWait()

    expect(screen.getByRole('heading', { name: 'Finance Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Setup checklist' })).toBeInTheDocument()
    expect(screen.getByText('Accounts')).toBeInTheDocument()
    expect(screen.getByText('Transactions')).toBeInTheDocument()
    expect(screen.getByText('Documents')).toBeInTheDocument()
  })

  it('renders section summary text for accessible sections', async () => {
    await renderAndWait()

    expect(screen.getByTestId('section-accounts-summary')).toHaveTextContent('3 accounts')
    expect(screen.getByTestId('section-documents-summary')).toHaveTextContent('2 missing')
  })

  it('renders pending work / warnings from API data', async () => {
    await renderAndWait()

    expect(screen.getByRole('heading', { name: 'Recent and pending work' })).toBeInTheDocument()
    expect(screen.getByText('Missing account mappings')).toBeInTheDocument()
  })

  it('renders primary actions as links', async () => {
    await renderAndWait()

    expect(screen.getByRole('heading', { name: 'Primary actions' })).toBeInTheDocument()

    const addAccount = screen.getByText('Add account').closest('a')
    expect(addAccount).toHaveAttribute('href', '/finance/accounts')

    const importTx = screen.getByText('Import transactions').closest('a')
    expect(importTx).toHaveAttribute('href', '/finance/account/all/import')
  })

  it('hides primary actions card when response has no primaryActions', async () => {
    await renderAndWait({ primaryActions: [] })

    expect(screen.queryByRole('heading', { name: 'Primary actions' })).not.toBeInTheDocument()
  })

  it('no_access sections render no summary content or counts', async () => {
    const summaryWithNoAccess = makeSummary({
      sections: [
        {
          id: 'accounts',
          status: 'ready',
          title: 'Accounts',
          summary: '3 accounts',
          counts: { accounts: 3 },
          actions: [],
        },
        {
          id: 'rsu',
          status: 'no_access',
          title: 'RSU',
          summary: '',
          counts: undefined,
          actions: [],
        },
      ],
    })
    mockGet.mockResolvedValueOnce(summaryWithNoAccess)
    await act(async () => {
      render(<FinanceHomePage />)
    })

    // RSU section title still shows (UX dimmed) but no summary/counts
    expect(screen.getByText('RSU')).toBeInTheDocument()
    expect(screen.queryByTestId('section-rsu-summary')).not.toBeInTheDocument()

    // Accounts section summary is visible
    expect(screen.getByTestId('section-accounts-summary')).toHaveTextContent('3 accounts')
  })

  it('changes year, fetches summary for the selected year, and URL reflects the year', async () => {
    mockGet.mockResolvedValue(makeSummary())
    await act(async () => {
      render(<FinanceHomePage />)
    })

    // Confirm initial fetch was for current year
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('year='))

    mockGet.mockClear()
    mockGet.mockResolvedValueOnce(makeSummary({ year: 2024 }))

    // Click the 2024 year item in the Select mock
    const yearButton2024 = screen.getByRole('button', { name: '2024' })
    await act(async () => {
      fireEvent.click(yearButton2024)
    })

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/finance/onboarding-summary?year=2024')
    })

    expect(window.location.search).toContain('year=2024')
  })

  it('handles API failure with explicit error UI and fallback links', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'))
    await act(async () => {
      render(<FinanceHomePage />)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByText('Unable to load dashboard')).toBeInTheDocument()
    expect(screen.getByText(/Failed to load Finance Dashboard/)).toBeInTheDocument()

    // Fallback links are present
    const accountsLink = screen.getByRole('link', { name: 'Accounts' })
    expect(accountsLink).toHaveAttribute('href', '/finance/accounts')

    const docsLink = screen.getByRole('link', { name: 'Documents' })
    expect(docsLink).toHaveAttribute('href', '/finance/documents')

    const taxLink = screen.getByRole('link', { name: 'Tax Preview' })
    expect(taxLink).toHaveAttribute('href', '/finance/tax-preview')
  })

  it('retry button re-fetches after an error', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'))
    await act(async () => {
      render(<FinanceHomePage />)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    mockGet.mockResolvedValueOnce(makeSummary())
    const retryButton = screen.getByRole('button', { name: /retry/i })
    await act(async () => {
      fireEvent.click(retryButton)
    })

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    expect(screen.getByRole('heading', { name: 'Finance Dashboard' })).toBeInTheDocument()
  })

  it('shows no pending work message when warnings array is empty', async () => {
    await renderAndWait({ warnings: [] })

    expect(screen.getByText('No pending work.')).toBeInTheDocument()
  })

  it('does not render any Agent API card', async () => {
    await renderAndWait()

    expect(screen.queryByText(/agent/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/MCP/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/API Access/i)).not.toBeInTheDocument()
  })
})
