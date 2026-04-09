import { render, screen } from '@testing-library/react'
import React from 'react'

import { TransactionsSummaryCards } from '../TransactionsSummaryCards'

// Minimal cn mock — just pass through classnames
jest.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

const defaultProps = {
  netAmount: '$1,200.00',
  netAmountPositive: true,
  totalCredits: '$2,000.00',
  totalDebits: '-$800.00',
  totalRows: 42,
}

describe('TransactionsSummaryCards', () => {
  it('renders net amount', () => {
    render(<TransactionsSummaryCards {...defaultProps} />)
    expect(screen.getByText('$1,200.00')).toBeInTheDocument()
  })

  it('renders total credits', () => {
    render(<TransactionsSummaryCards {...defaultProps} />)
    expect(screen.getByText('$2,000.00')).toBeInTheDocument()
  })

  it('renders total debits', () => {
    render(<TransactionsSummaryCards {...defaultProps} />)
    expect(screen.getByText('-$800.00')).toBeInTheDocument()
  })

  it('renders the matching row count', () => {
    render(<TransactionsSummaryCards {...defaultProps} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('formats large row counts with locale separators', () => {
    render(<TransactionsSummaryCards {...defaultProps} totalRows={1234} />)
    expect(screen.getByText('1,234')).toBeInTheDocument()
  })

  it('applies positive color class when netAmountPositive is true', () => {
    const { container } = render(<TransactionsSummaryCards {...defaultProps} netAmountPositive />)
    const netEl = screen.getByText('$1,200.00')
    expect(netEl.className).toContain('text-success')
  })

  it('applies negative color class when netAmountPositive is false', () => {
    render(<TransactionsSummaryCards {...defaultProps} netAmountPositive={false} netAmount="-$100.00" />)
    const netEl = screen.getByText('-$100.00')
    expect(netEl.className).toContain('text-destructive')
  })
})
