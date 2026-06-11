import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'
import React from 'react'

import FinanceCategorizationPage, { CATEGORIZATION_TABS } from '../FinanceCategorizationPage'

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
  Card: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: React.ComponentProps<'span'>) => <span {...props}>{children}</span>,
}))

jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, defaultValue }: { children: React.ReactNode; defaultValue?: string }) => (
    <div data-default-value={defaultValue}>{children}</div>
  ),
  TabsList: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  TabsTrigger: ({ children, value, ...props }: React.ComponentProps<'button'> & { value: string }) => (
    <button data-value={value} {...props}>
      {children}
    </button>
  ),
  TabsContent: ({ children, value, ...props }: React.ComponentProps<'div'> & { value: string }) => (
    <div data-tab-content={value} {...props}>
      {children}
    </div>
  ),
}))

jest.mock('../ManageTagsPage', () => ({
  __esModule: true,
  default: () => <div data-testid="manage-tags-page">ManageTagsPage</div>,
}))

jest.mock('../rules_engine/RulesList', () => ({
  __esModule: true,
  default: () => <div data-testid="rules-list">RulesList</div>,
}))

// ── tests ─────────────────────────────────────────────────────────────────────

describe('FinanceCategorizationPage', () => {
  afterEach(() => {
    document.getElementById('app-initial-data')?.remove()
    jest.clearAllMocks()
  })

  it('renders the Categorization heading', () => {
    setAdmin()
    render(<FinanceCategorizationPage />)
    expect(screen.getByRole('heading', { name: 'Categorization' })).toBeInTheDocument()
  })

  it('renders all four tabs for a fully-permissioned user', () => {
    setAdmin()
    render(<FinanceCategorizationPage />)

    expect(screen.getByTestId('tab-tags')).toBeInTheDocument()
    expect(screen.getByTestId('tab-rules')).toBeInTheDocument()
    expect(screen.getByTestId('tab-tax-characteristics')).toBeInTheDocument()
    expect(screen.getByTestId('tab-schedule-c')).toBeInTheDocument()
  })

  it('renders Tags, Rules, Tax Characteristics sections and Schedule C deep link for a permitted user', () => {
    setAdmin()
    render(<FinanceCategorizationPage />)

    expect(screen.getByTestId('tab-content-tags')).toBeInTheDocument()
    expect(screen.getByTestId('manage-tags-page')).toBeInTheDocument()

    expect(screen.getByTestId('tab-content-rules')).toBeInTheDocument()
    expect(screen.getByTestId('rules-list')).toBeInTheDocument()

    expect(screen.getByTestId('tab-content-tax-characteristics')).toBeInTheDocument()
    expect(screen.getByTestId('tax-characteristics-panel')).toBeInTheDocument()

    expect(screen.getByTestId('tab-content-schedule-c')).toBeInTheDocument()
    expect(screen.getByTestId('schedule-c-panel')).toBeInTheDocument()
  })

  it('shows Schedule C deep link pointing to /finance/tax-preview', () => {
    setAdmin()
    render(<FinanceCategorizationPage />)

    const link = screen.getByTestId('schedule-c-link')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/finance/tax-preview')
  })

  it('hides Tags, Rules, and Tax Characteristics tabs when finance.rules.manage is missing', () => {
    setPermissions(['finance.access'])
    render(<FinanceCategorizationPage />)

    expect(screen.queryByTestId('tab-tags')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tab-rules')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tab-tax-characteristics')).not.toBeInTheDocument()
  })

  it('always shows the Schedule C Mapping tab regardless of permissions', () => {
    setPermissions(['finance.access'])
    render(<FinanceCategorizationPage />)

    expect(screen.getByTestId('tab-schedule-c')).toBeInTheDocument()
    expect(screen.getByTestId('schedule-c-panel')).toBeInTheDocument()
  })

  it('hides tab content for tags/rules/tax-characteristics when finance.rules.manage is missing', () => {
    setPermissions(['finance.access'])
    render(<FinanceCategorizationPage />)

    expect(screen.queryByTestId('tab-content-tags')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tab-content-rules')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tab-content-tax-characteristics')).not.toBeInTheDocument()
    expect(screen.getByTestId('tab-content-schedule-c')).toBeInTheDocument()
  })

  it('exports CATEGORIZATION_TABS with four entries', () => {
    expect(CATEGORIZATION_TABS).toHaveLength(4)
    expect(CATEGORIZATION_TABS.map((t) => t.id)).toEqual([
      'tags',
      'rules',
      'tax-characteristics',
      'schedule-c',
    ])
  })

  it('schedule-c tab has no permission requirement (always visible)', () => {
    const schedCTab = CATEGORIZATION_TABS.find((t) => t.id === 'schedule-c')
    expect(schedCTab?.permission).toBeNull()
  })

  it('tags, rules, and tax-characteristics tabs require finance.rules.manage', () => {
    const restricted = CATEGORIZATION_TABS.filter((t) => t.id !== 'schedule-c')
    restricted.forEach((tab) => {
      expect(tab.permission).toBe('finance.rules.manage')
    })
  })
})
