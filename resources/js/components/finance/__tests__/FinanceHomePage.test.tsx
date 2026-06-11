import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'
import React from 'react'

import FinanceHomePage from '../FinanceHomePage'

jest.mock('@/components/MainTitle', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, asChild, ...props }: React.ComponentProps<'button'> & { asChild?: boolean }) => {
    if (asChild) {
      return <>{children}</>
    }
    return <button {...props}>{children}</button>
  },
}))

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: React.ComponentProps<'div'>) => <div className={className}>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

describe('FinanceHomePage', () => {
  beforeEach(() => {
    render(<FinanceHomePage />)
  })

  it('renders the dashboard heading', () => {
    expect(screen.getByRole('heading', { name: 'Finance Dashboard' })).toBeInTheDocument()
  })

  it('renders the setup checklist section with all expected items', () => {
    expect(screen.getByRole('heading', { name: 'Setup checklist' })).toBeInTheDocument()

    const checklist = screen.getByRole('list', { name: 'Setup checklist' })
    expect(checklist).toBeInTheDocument()

    const expectedItems = [
      'Accounts',
      'Transactions',
      'Documents',
      'Jobs and Businesses',
      'Payslips',
      'RSU',
      'K-1 / Partnership Basis',
      'Lots / 1099-B Reconciliation',
      'Carryovers',
      'Categorization',
      'Tax Preview',
    ]

    for (const item of expectedItems) {
      expect(screen.getByText(item)).toBeInTheDocument()
    }
  })

  it('renders the recent and pending work section', () => {
    expect(screen.getByRole('heading', { name: 'Recent and pending work' })).toBeInTheDocument()

    const pendingList = screen.getByRole('list', { name: 'Recent and pending work' })
    expect(pendingList).toBeInTheDocument()

    expect(screen.getByText('Pending document reviews')).toBeInTheDocument()
    expect(screen.getByText('Duplicate transactions')).toBeInTheDocument()
    expect(screen.getByText('Failed imports')).toBeInTheDocument()
  })

  it('renders the primary actions section with deep-links to existing routes', () => {
    expect(screen.getByRole('heading', { name: 'Primary actions' })).toBeInTheDocument()

    const actionsContainer = screen.getByRole('list', { name: 'Primary actions' })
    expect(actionsContainer).toBeInTheDocument()

    const addAccount = screen.getByText('Add account').closest('a')
    expect(addAccount).toHaveAttribute('href', '/finance/accounts')

    const importTx = screen.getByText('Import transactions').closest('a')
    expect(importTx).toHaveAttribute('href', '/finance/account/all/import')

    const importDocs = screen.getByText('Import tax documents').closest('a')
    expect(importDocs).toHaveAttribute('href', '/finance/documents')

    const taxPreview = screen.getByText('Open Tax Preview').closest('a')
    expect(taxPreview).toHaveAttribute('href', '/finance/tax-preview')
  })

  it('does not render any Agent API card', () => {
    expect(screen.queryByText(/agent/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/MCP/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/API Access/i)).not.toBeInTheDocument()
  })
})
