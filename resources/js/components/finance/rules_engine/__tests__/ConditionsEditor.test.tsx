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
  SelectValue: () => <span data-testid="select-value" />,
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
})
