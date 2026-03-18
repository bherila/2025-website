import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import type { FinRule } from '../types'

// Mock fetchWrapper before importing the component
jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    [key: string]: any
  }) => <button {...props}>{children}</button>,
}))

jest.mock('@/components/ui/spinner', () => ({
  Spinner: () => <div data-testid="spinner" />,
}))

jest.mock('@/components/ui/badge', () => ({
  Badge: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    [key: string]: any
  }) => <span {...props}>{children}</span>,
}))

// Mock child components to isolate RulesList
jest.mock('../RuleEditorModal', () => ({
  RuleEditorModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="rule-editor-modal">Editor Modal</div> : null,
}))

jest.mock('../RuleRow', () => ({
  RuleRow: ({ rule, onEdit }: { rule: FinRule; onEdit: () => void }) => (
    <div data-testid={`rule-row-${rule.id}`}>
      <span>{rule.title}</span>
      <button onClick={onEdit}>Edit</button>
    </div>
  ),
}))

import { fetchWrapper } from '@/fetchWrapper'
import RulesList from '../RulesList'

const mockRules: FinRule[] = [
  {
    id: 1,
    user_id: 1,
    order: 0,
    title: 'Tag Groceries',
    is_disabled: false,
    stop_processing_if_match: false,
    conditions: [{ type: 'description_contains', operator: 'CONTAINS', value: 'grocery', value_extra: null }],
    actions: [{ type: 'add_tag', target: '5', payload: null, order: 0 }],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 2,
    user_id: 1,
    order: 1,
    title: 'Negate Refunds',
    is_disabled: true,
    stop_processing_if_match: true,
    conditions: [],
    actions: [{ type: 'negate_amount', target: null, payload: null, order: 0 }],
    created_at: '2025-01-02T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
  },
]

describe('RulesList', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders loading state initially', () => {
    // Never resolve the fetch so it stays in loading
    ;(fetchWrapper.get as jest.Mock).mockReturnValue(new Promise(() => {}))
    render(<RulesList />)
    expect(screen.getByTestId('spinner')).toBeInTheDocument()
  })

  it('renders empty state message when no rules exist', async () => {
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue([])
    render(<RulesList />)

    await waitFor(() => {
      expect(screen.queryByTestId('spinner')).not.toBeInTheDocument()
    })

    expect(
      screen.getByText('No rules yet. Create your first rule to automate transaction processing.'),
    ).toBeInTheDocument()
  })

  it('renders list of rules after fetch', async () => {
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue(mockRules)
    render(<RulesList />)

    await waitFor(() => {
      expect(screen.getByText('Tag Groceries')).toBeInTheDocument()
    })

    expect(screen.getByText('Negate Refunds')).toBeInTheDocument()
    expect(screen.getByTestId('rule-row-1')).toBeInTheDocument()
    expect(screen.getByTestId('rule-row-2')).toBeInTheDocument()
  })

  it('shows "New Rule" button', async () => {
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue(mockRules)
    render(<RulesList />)

    await waitFor(() => {
      expect(screen.getByText('New Rule')).toBeInTheDocument()
    })
  })

  it('opens editor modal when "New Rule" clicked', async () => {
    ;(fetchWrapper.get as jest.Mock).mockResolvedValue(mockRules)
    render(<RulesList />)

    await waitFor(() => {
      expect(screen.getByText('New Rule')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('rule-editor-modal')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('New Rule'))

    expect(screen.getByTestId('rule-editor-modal')).toBeInTheDocument()
  })
})
