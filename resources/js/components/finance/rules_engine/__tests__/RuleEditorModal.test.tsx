import '@testing-library/jest-dom'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import type { FinRule } from '../types'

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
    disabled,
    ...props
  }: {
    children: React.ReactNode
    disabled?: boolean
    [key: string]: any
  }) => (
    <button disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

jest.mock('@/components/ui/spinner', () => ({
  Spinner: () => <div data-testid="spinner" />,
}))

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}))

jest.mock('@/components/ui/label', () => ({
  Label: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    [key: string]: any
  }) => <label {...props}>{children}</label>,
}))

jest.mock('@/components/ui/switch', () => ({
  Switch: ({ id, checked, onCheckedChange }: any) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      data-testid={id}
    />
  ),
}))

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div data-testid="dialog-footer">{children}</div>,
}))

jest.mock('../ConditionsEditor', () => ({
  ConditionsEditor: () => <div data-testid="conditions-editor" />,
}))

jest.mock('../ActionsEditor', () => ({
  ActionsEditor: () => <div data-testid="actions-editor" />,
}))

import { fetchWrapper } from '@/fetchWrapper'

import { RuleEditorModal } from '../RuleEditorModal'

const existingRule: FinRule = {
  id: 42,
  user_id: 1,
  order: 0,
  title: 'Existing Rule',
  is_disabled: false,
  stop_processing_if_match: true,
  conditions: [{ type: 'amount', operator: 'ABOVE', value: '100', value_extra: null }],
  actions: [{ type: 'add_tag', target: '5', payload: null, order: 0 }],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
}

describe('RuleEditorModal', () => {
  const defaultProps = {
    open: true,
    onOpenChange: jest.fn(),
    rule: null as FinRule | null,
    onSaved: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders with empty form for new rule', () => {
    render(<RuleEditorModal {...defaultProps} />)

    expect(screen.getByText('New Rule')).toBeInTheDocument()
    expect(screen.getByText('Create a new rule to automate transaction processing.')).toBeInTheDocument()

    const titleInput = screen.getByPlaceholderText('Rule title')
    expect(titleInput).toHaveValue('')

    expect(screen.getByTestId('conditions-editor')).toBeInTheDocument()
    expect(screen.getByTestId('actions-editor')).toBeInTheDocument()
  })

  it('validates that title is required', async () => {
    render(<RuleEditorModal {...defaultProps} />)

    // Click Save with empty title
    fireEvent.click(screen.getByText('Save Rule'))

    await waitFor(() => {
      expect(screen.getByText('Title is required.')).toBeInTheDocument()
    })

    // fetchWrapper.post should NOT have been called
    expect(fetchWrapper.post).not.toHaveBeenCalled()
  })

  it('shows save loading state', async () => {
    // Make post hang so we can observe loading state
    ;(fetchWrapper.post as jest.Mock).mockReturnValue(new Promise(() => {}))

    render(<RuleEditorModal {...defaultProps} />)

    const titleInput = screen.getByPlaceholderText('Rule title')
    fireEvent.change(titleInput, { target: { value: 'My Rule' } })

    fireEvent.click(screen.getByText('Save Rule'))

    await waitFor(() => {
      expect(screen.getByText('Saving…')).toBeInTheDocument()
      expect(screen.getByTestId('spinner')).toBeInTheDocument()
    })
  })

  it('supports Ctrl+Enter submission', async () => {
    ;(fetchWrapper.post as jest.Mock).mockResolvedValue({ id: 1 })

    render(<RuleEditorModal {...defaultProps} />)

    const titleInput = screen.getByPlaceholderText('Rule title')
    fireEvent.change(titleInput, { target: { value: 'Keyboard Rule' } })

    // Simulate Ctrl+Enter on window
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })

    await waitFor(() => {
      expect(fetchWrapper.post).toHaveBeenCalledWith(
        '/api/finance/rules',
        expect.objectContaining({ title: 'Keyboard Rule' }),
      )
    })
  })

  it('renders with pre-filled data for editing existing rule', () => {
    render(<RuleEditorModal {...defaultProps} rule={existingRule} />)

    expect(screen.getByText('Edit Rule')).toBeInTheDocument()
    expect(screen.getByText('Update the conditions and actions for this rule.')).toBeInTheDocument()

    const titleInput = screen.getByPlaceholderText('Rule title')
    expect(titleInput).toHaveValue('Existing Rule')

    // "Run this rule now" checkbox should appear in edit mode
    expect(screen.getByText('Run this rule now against existing transactions')).toBeInTheDocument()
  })
})
