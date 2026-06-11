import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'

import DocumentEmptyState from './DocumentEmptyState'

describe('DocumentEmptyState', () => {
  it('renders the import action link', () => {
    render(<DocumentEmptyState />)

    const link = screen.getByRole('link', { name: /import w-2, 1099, k-1, or broker tax package/i })
    expect(link).toHaveAttribute('href', '/finance/documents')
  })
})
