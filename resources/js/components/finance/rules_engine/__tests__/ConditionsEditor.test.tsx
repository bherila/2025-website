import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import { ConditionsEditor } from '../ConditionsEditor'
import type { FinRuleCondition } from '../types'

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    [key: string]: any
  }) => <button {...props}>{children}</button>,
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

jest.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select-root" data-value={value}>
      {React.Children.map(children, (child: any) =>
        child ? React.cloneElement(child, { onValueChange }) : null,
      )}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div data-testid="select-trigger">{children}</div>,
  SelectValue: ({ placeholder }: any) => <span data-testid="select-value">{placeholder}</span>,
  SelectContent: ({ children, onValueChange }: any) => (
    <div data-testid="select-content">
      {React.Children.map(children, (child: any) =>
        child ? React.cloneElement(child, { onValueChange }) : null,
      )}
    </div>
  ),
  SelectItem: ({ children, value, onValueChange }: any) => (
    <option data-testid={`select-item-${value}`} onClick={() => onValueChange?.(value)} value={value}>
      {children}
    </option>
  ),
}))

// Mock fetch for accounts API — return a never-resolving promise so state updates
// don't fire after test cleanup and produce act() warnings.
beforeEach(() => {
  (globalThis as Record<string, unknown>)['fetch'] = jest.fn().mockReturnValue(new Promise(() => {}))
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('ConditionsEditor', () => {
  it('renders empty state with "Add Condition" button', () => {
    render(<ConditionsEditor conditions={[]} onChange={jest.fn()} />)
    expect(screen.getByText('No conditions — rule matches all transactions.')).toBeInTheDocument()
    expect(screen.getByText('Add Condition')).toBeInTheDocument()
  })

  it('adds a new condition row when button clicked', () => {
    const onChange = jest.fn()
    render(<ConditionsEditor conditions={[]} onChange={onChange} />)

    fireEvent.click(screen.getByText('Add Condition'))

    expect(onChange).toHaveBeenCalledTimes(1)
    const newConditions = onChange.mock.calls[0][0]
    expect(newConditions).toHaveLength(1)
    expect(newConditions[0]).toEqual({
      type: 'amount',
      operator: 'ABOVE',
      value: '',
      value_extra: null,
    })
  })

  it('removes a condition row', () => {
    const onChange = jest.fn()
    const conditions: FinRuleCondition[] = [
      { type: 'amount', operator: 'ABOVE', value: '100', value_extra: null },
      { type: 'direction', operator: 'INCOME', value: null, value_extra: null },
    ]
    render(<ConditionsEditor conditions={conditions} onChange={onChange} />)

    const removeButtons = screen.getAllByTitle('Remove condition')
    expect(removeButtons).toHaveLength(2)

    fireEvent.click(removeButtons[0]!)

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated = onChange.mock.calls[0][0]
    expect(updated).toHaveLength(1)
    expect(updated[0].type).toBe('direction')
  })

  it('preserves condition order', () => {
    const onChange = jest.fn()
    const conditions: FinRuleCondition[] = [
      { type: 'amount', operator: 'ABOVE', value: '50', value_extra: null },
      { type: 'direction', operator: 'INCOME', value: null, value_extra: null },
      { type: 'description_contains', operator: 'CONTAINS', value: 'grocery', value_extra: null },
    ]
    render(<ConditionsEditor conditions={conditions} onChange={onChange} />)

    // Remove middle condition
    const removeButtons = screen.getAllByTitle('Remove condition')
    fireEvent.click(removeButtons[1]!)

    const updated = onChange.mock.calls[0][0]
    expect(updated).toHaveLength(2)
    expect(updated[0].type).toBe('amount')
    expect(updated[1].type).toBe('description_contains')
  })

  it('hides Value box for direction INCOME operator', () => {
    render(
      <ConditionsEditor
        conditions={[{ type: 'direction', operator: 'INCOME', value: null, value_extra: null }]}
        onChange={jest.fn()}
      />,
    )
    // No value input should be rendered
    expect(screen.queryByPlaceholderText('Value')).not.toBeInTheDocument()
  })

  it('hides Value box for direction EXPENSE operator', () => {
    render(
      <ConditionsEditor
        conditions={[{ type: 'direction', operator: 'EXPENSE', value: null, value_extra: null }]}
        onChange={jest.fn()}
      />,
    )
    expect(screen.queryByPlaceholderText('Value')).not.toBeInTheDocument()
  })

  it('hides Value box for stock_symbol_presence HAVE operator', () => {
    render(
      <ConditionsEditor
        conditions={[{ type: 'stock_symbol_presence', operator: 'HAVE', value: null, value_extra: null }]}
        onChange={jest.fn()}
      />,
    )
    expect(screen.queryByPlaceholderText('Value')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('e.g. AAPL, TSLA')).not.toBeInTheDocument()
  })

  it('hides Value box for stock_symbol_presence DO_NOT_HAVE operator', () => {
    render(
      <ConditionsEditor
        conditions={[{ type: 'stock_symbol_presence', operator: 'DO_NOT_HAVE', value: null, value_extra: null }]}
        onChange={jest.fn()}
      />,
    )
    expect(screen.queryByPlaceholderText('Value')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('e.g. AAPL, TSLA')).not.toBeInTheDocument()
  })

  it('shows Value input with symbol placeholder for stock_symbol_presence IS_SYMBOL operator', () => {
    render(
      <ConditionsEditor
        conditions={[{ type: 'stock_symbol_presence', operator: 'IS_SYMBOL', value: 'AAPL', value_extra: null }]}
        onChange={jest.fn()}
      />,
    )
    expect(screen.getByPlaceholderText('e.g. AAPL, TSLA')).toBeInTheDocument()
  })

  it('shows account Select (not plain text input) for account_id condition', () => {
    render(
      <ConditionsEditor
        conditions={[{ type: 'account_id', operator: 'EQUALS', value: '42', value_extra: null }]}
        onChange={jest.fn()}
      />,
    )
    // Account Select should render "Select account" placeholder, not a plain "Value" input
    expect(screen.getByText('Select account')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Value')).not.toBeInTheDocument()
  })
})

