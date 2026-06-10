import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { toast } from 'sonner'

import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'

import TransactionDetailsModal from '../TransactionDetailsModal'

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
  },
}))

jest.mock('../useFinanceTags', () => ({
  useFinanceTags: () => ({
    tags: [
      { tag_id: 10, tag_label: 'Groceries', tag_color: '#22c55e' },
      { tag_id: 20, tag_label: 'Travel', tag_color: '#0ea5e9' },
    ],
  }),
}))

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

jest.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}))

jest.mock('@/components/ui/spinner', () => ({
  Spinner: () => <span data-testid="spinner" />,
}))

const transaction: AccountLineItem = {
  t_id: 123,
  t_date: '2026-01-15',
  t_type: 'Debit',
  t_amt: 12.34,
  t_account_balance: 0,
  t_comment: null,
  t_description: 'Original transaction',
  t_qty: 0,
  t_price: 0,
  t_commission: 0,
  t_fee: 0,
  t_symbol: null,
  tags: [],
}

describe('TransactionDetailsModal', () => {
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(fetchWrapper.get).mockResolvedValue([])
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('optimistically shows a tag while it is being added', async () => {
    let resolveAdd: () => void = () => {}
    jest.mocked(fetchWrapper.post).mockImplementation(() => new Promise((resolve) => {
      resolveAdd = () => resolve({})
    }))

    render(<TransactionDetailsModal transaction={transaction} isOpen onClose={jest.fn()} />)
    await waitFor(() => expect(fetchWrapper.get).toHaveBeenCalledWith('/api/finance/transactions/123/rsu-links'))
    fireEvent.click(screen.getByText('+ Groceries'))

    expect(screen.getByTitle('Adding tag...')).toBeInTheDocument()
    expect(screen.getByTestId('spinner')).toBeInTheDocument()
    expect(fetchWrapper.post).toHaveBeenCalledWith('/api/finance/tags/apply', {
      tag_id: 10,
      transaction_ids: '123',
    })

    resolveAdd()
    await waitFor(() => expect(screen.getByTitle('Click to remove tag')).toBeInTheDocument())
  })

  it('rolls back an optimistic add when the request fails', async () => {
    jest.mocked(fetchWrapper.post).mockRejectedValue(new Error('nope'))

    render(<TransactionDetailsModal transaction={transaction} isOpen onClose={jest.fn()} />)
    fireEvent.click(screen.getByText('+ Groceries'))

    await waitFor(() => expect(screen.getByText('+ Groceries')).toBeInTheDocument())
    expect(toast.error).toHaveBeenCalledWith('Failed to add tag')
  })

  it('optimistically removes a tag while the request is pending', () => {
    jest.mocked(fetchWrapper.post).mockImplementation(() => new Promise(() => {}))

    render(
      <TransactionDetailsModal
        transaction={{
          ...transaction,
          tags: [{ tag_id: 20, tag_label: 'Travel', tag_color: '#0ea5e9', tag_userid: '' }],
        }}
        isOpen
        onClose={jest.fn()}
      />,
    )

    fireEvent.click(screen.getByText('Travel'))

    expect(screen.getByText('No tags applied.')).toBeInTheDocument()
    expect(fetchWrapper.post).toHaveBeenCalledWith('/api/finance/tags/remove', {
      transaction_ids: '123',
      tag_id: 20,
    })
  })
})
