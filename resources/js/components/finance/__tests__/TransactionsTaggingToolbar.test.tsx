import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import { TransactionsTaggingToolbar } from '../TransactionsTaggingToolbar'
import type { FinanceTag } from '../useFinanceTags'

// --- Mocks ------------------------------------------------------------------

jest.mock('@/components/ui/alert', () => ({
  Alert: ({ children, ...p }: React.ComponentProps<'div'>) => <div role="alert" {...p}>{children}</div>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

jest.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children, onClick }: React.ComponentProps<'button'>) => (
    <button onClick={onClick}>{children}</button>
  ),
  AlertDialogAction: ({ children, onClick }: React.ComponentProps<'button'>) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, asChild, ...rest }: React.ComponentProps<'button'> & { asChild?: boolean }) => {
    if (asChild) {
      // Render the first child directly, merging the onClick/disabled if needed
      return <span onClick={onClick}>{children}</span>
    }
    return (
      <button onClick={onClick} disabled={disabled} {...rest}>
        {children}
      </button>
    )
  },
}))

jest.mock('@/components/ui/spinner', () => ({
  Spinner: () => <div data-testid="spinner" />,
}))

jest.mock('../rules_engine/TagSelect', () => ({
  TagSelect: ({ onChange, tags, placeholder }: { value: string | null; onChange: (v: string) => void; tags: FinanceTag[]; placeholder?: string; className?: string }) => (
    <select aria-label={placeholder ?? 'Select a tag'} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {tags.map((t) => (
        <option key={t.tag_id} value={String(t.tag_id)}>{t.tag_label}</option>
      ))}
    </select>
  ),
}))

// ---------------------------------------------------------------------------

const sampleTags: FinanceTag[] = [
  { tag_id: 1, tag_label: 'business', tag_color: '#000' },
  { tag_id: 2, tag_label: 'personal', tag_color: '#fff' },
]

const defaultProps = {
  effectiveCount: 3,
  isSelection: true,
  onApplyTag: jest.fn().mockResolvedValue(undefined),
  onRemoveTag: jest.fn().mockResolvedValue(undefined),
  onRemoveAllTags: jest.fn().mockResolvedValue(undefined),
  availableTags: sampleTags,
  isLoadingTags: false,
  onClearSelection: jest.fn(),
}

describe('TransactionsTaggingToolbar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders label with selected row count', () => {
    render(<TransactionsTaggingToolbar {...defaultProps} />)
    expect(screen.getByText(/Action on 3 selected rows/i)).toBeInTheDocument()
  })

  it('renders "matching rows" label when isSelection is false', () => {
    render(<TransactionsTaggingToolbar {...defaultProps} isSelection={false} />)
    expect(screen.getByText(/Action on all 3 matching rows/i)).toBeInTheDocument()
  })

  it('shows a spinner while tags are loading', () => {
    render(<TransactionsTaggingToolbar {...defaultProps} isLoadingTags />)
    expect(screen.getByTestId('spinner')).toBeInTheDocument()
  })

  it('shows Clear button when isSelection=true', () => {
    render(<TransactionsTaggingToolbar {...defaultProps} />)
    expect(screen.getByText(/✕ Clear/i)).toBeInTheDocument()
  })

  it('does not show Clear button when isSelection=false', () => {
    render(<TransactionsTaggingToolbar {...defaultProps} isSelection={false} />)
    expect(screen.queryByText(/✕ Clear/i)).not.toBeInTheDocument()
  })

  it('calls onClearSelection when Clear clicked', () => {
    const onClearSelection = jest.fn()
    render(<TransactionsTaggingToolbar {...defaultProps} onClearSelection={onClearSelection} />)
    fireEvent.click(screen.getByText(/✕ Clear/i))
    expect(onClearSelection).toHaveBeenCalled()
  })

  it('calls onApplyTag with numeric tag id when Add clicked', async () => {
    const onApplyTag = jest.fn().mockResolvedValue(undefined)
    render(<TransactionsTaggingToolbar {...defaultProps} onApplyTag={onApplyTag} />)
    // Select a tag first
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }))
    expect(onApplyTag).toHaveBeenCalledWith(1)
  })

  it('Add button is disabled when no tag is selected', () => {
    render(<TransactionsTaggingToolbar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /^Add$/i })).toBeDisabled()
  })

  it('shows an error alert when effectiveCount > 1000', () => {
    render(<TransactionsTaggingToolbar {...defaultProps} effectiveCount={1001} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/1,001/)).toBeInTheDocument()
  })

  it('shows Delete button when onBatchDelete is provided', () => {
    const onBatchDelete = jest.fn().mockResolvedValue(undefined)
    render(<TransactionsTaggingToolbar {...defaultProps} onBatchDelete={onBatchDelete} />)
    expect(screen.getByRole('button', { name: /^Delete$/i })).toBeInTheDocument()
  })

  it('does not show Delete button when onBatchDelete is not provided', () => {
    render(<TransactionsTaggingToolbar {...defaultProps} />)
    expect(screen.queryByRole('button', { name: /^Delete$/i })).not.toBeInTheDocument()
  })

  it('opens batch delete confirmation dialog when Delete clicked', () => {
    const onBatchDelete = jest.fn().mockResolvedValue(undefined)
    render(<TransactionsTaggingToolbar {...defaultProps} onBatchDelete={onBatchDelete} />)
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Delete transactions/i)).toBeInTheDocument()
  })

  it('calls onBatchDelete when confirm delete pressed', () => {
    const onBatchDelete = jest.fn().mockResolvedValue(undefined)
    render(<TransactionsTaggingToolbar {...defaultProps} onBatchDelete={onBatchDelete} />)
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }))
    fireEvent.click(screen.getByText(/Confirm Delete/i))
    expect(onBatchDelete).toHaveBeenCalled()
  })

  it('opens remove-all-tags confirmation when Clear All clicked', () => {
    render(<TransactionsTaggingToolbar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Clear All/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('calls onRemoveAllTags when confirmed', () => {
    const onRemoveAllTags = jest.fn().mockResolvedValue(undefined)
    render(<TransactionsTaggingToolbar {...defaultProps} onRemoveAllTags={onRemoveAllTags} />)
    fireEvent.click(screen.getByRole('button', { name: /Clear All/i }))
    fireEvent.click(screen.getByText(/Confirm Removal/i))
    expect(onRemoveAllTags).toHaveBeenCalled()
  })
})
