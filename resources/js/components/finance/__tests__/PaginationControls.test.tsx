import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import { PaginationControls } from '../PaginationControls'

// Minimal Button mock
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...rest }: React.ComponentProps<'button'>) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}))

const defaultProps = {
  currentPage: 1,
  totalPages: 5,
  totalRows: 500,
  pageSize: 100,
  viewAll: false,
  onPageChange: jest.fn(),
  onViewAll: jest.fn(),
  onPageSizeChange: jest.fn(),
}

describe('PaginationControls', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders row range info', () => {
    render(<PaginationControls {...defaultProps} />)
    expect(screen.getByText(/SHOWING 1–100 OF 500 ROWS/i)).toBeInTheDocument()
  })

  it('shows "Page 1 of 5"', () => {
    render(<PaginationControls {...defaultProps} />)
    expect(screen.getByText(/Page 1 of 5/i)).toBeInTheDocument()
  })

  it('first-page button is disabled on page 1', () => {
    render(<PaginationControls {...defaultProps} currentPage={1} />)
    const firstBtn = screen.getByText('««')
    expect(firstBtn.closest('button')).toBeDisabled()
  })

  it('last-page button is disabled on the last page', () => {
    render(<PaginationControls {...defaultProps} currentPage={5} />)
    const lastBtn = screen.getByText('»»')
    expect(lastBtn.closest('button')).toBeDisabled()
  })

  it('calls onPageChange with page+1 when next is clicked', () => {
    const onPageChange = jest.fn()
    render(<PaginationControls {...defaultProps} currentPage={2} onPageChange={onPageChange} />)
    fireEvent.click(screen.getByText('»'))
    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it('calls onPageChange with page-1 when prev is clicked', () => {
    const onPageChange = jest.fn()
    render(<PaginationControls {...defaultProps} currentPage={3} onPageChange={onPageChange} />)
    fireEvent.click(screen.getByText('«'))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('calls onPageChange with 1 when first-page button clicked', () => {
    const onPageChange = jest.fn()
    render(<PaginationControls {...defaultProps} currentPage={4} onPageChange={onPageChange} />)
    fireEvent.click(screen.getByText('««'))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it('calls onPageChange with totalPages when last-page button clicked', () => {
    const onPageChange = jest.fn()
    render(<PaginationControls {...defaultProps} currentPage={1} onPageChange={onPageChange} />)
    fireEvent.click(screen.getByText('»»'))
    expect(onPageChange).toHaveBeenCalledWith(5)
  })

  it('calls onViewAll when "Show all" option selected', () => {
    const onViewAll = jest.fn()
    render(<PaginationControls {...defaultProps} onViewAll={onViewAll} />)
    const select = screen.getByRole('combobox', { name: /rows per page/i })
    fireEvent.change(select, { target: { value: 'all' } })
    expect(onViewAll).toHaveBeenCalled()
  })

  it('calls onPageSizeChange when a different page size selected', () => {
    const onPageSizeChange = jest.fn()
    render(<PaginationControls {...defaultProps} onPageSizeChange={onPageSizeChange} />)
    const select = screen.getByRole('combobox', { name: /rows per page/i })
    fireEvent.change(select, { target: { value: '25' } })
    expect(onPageSizeChange).toHaveBeenCalledWith(25)
  })

  it('shows correct range on the last partial page', () => {
    render(<PaginationControls {...defaultProps} currentPage={5} totalRows={450} pageSize={100} />)
    // Page 5: rows 401–450
    expect(screen.getByText(/SHOWING 401–450 OF 450 ROWS/i)).toBeInTheDocument()
  })

  it('shows "SHOWING 0–0" when there are no rows', () => {
    render(<PaginationControls {...defaultProps} totalRows={0} />)
    expect(screen.getByText(/SHOWING 0–0 OF 0 ROWS/i)).toBeInTheDocument()
  })

  it('when viewAll is true shows 1–totalRows', () => {
    render(<PaginationControls {...defaultProps} viewAll totalRows={300} />)
    expect(screen.getByText(/SHOWING 1–300 OF 300 ROWS/i)).toBeInTheDocument()
  })
})
