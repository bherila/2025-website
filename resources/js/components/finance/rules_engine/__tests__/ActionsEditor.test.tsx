import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import { ActionsEditor } from '../ActionsEditor'
import type { FinRuleAction } from '../types'

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

describe('ActionsEditor', () => {
  let consoleErrorSpy: jest.SpyInstance
  beforeAll(() => {
    const originalConsoleError = console.error.bind(console)
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      if (typeof args[0] === 'string' && args[0].includes('inside a test was not wrapped in act')) {
        return
      }
      originalConsoleError(...args)
    })
  })
  afterAll(() => {
    consoleErrorSpy.mockRestore()
  })

  it('renders empty state with "Add Action" button', () => {
    render(<ActionsEditor actions={[]} onChange={jest.fn()} />)
    expect(screen.getByText('No actions configured.')).toBeInTheDocument()
    expect(screen.getByText('Add Action')).toBeInTheDocument()
  })

  it('adds a new action row when button clicked', () => {
    const onChange = jest.fn()
    render(<ActionsEditor actions={[]} onChange={onChange} />)

    fireEvent.click(screen.getByText('Add Action'))

    expect(onChange).toHaveBeenCalledTimes(1)
    const newActions = onChange.mock.calls[0][0]
    expect(newActions).toHaveLength(1)
    expect(newActions[0]).toEqual({
      type: 'add_tag',
      target: '',
      payload: null,
      order: 0,
    })
  })

  it('removes an action row', () => {
    const onChange = jest.fn()
    const actions: FinRuleAction[] = [
      { type: 'add_tag', target: '1', payload: null, order: 0 },
      { type: 'set_description', target: 'new desc', payload: null, order: 1 },
    ]
    render(<ActionsEditor actions={actions} onChange={onChange} />)

    const removeButtons = screen.getAllByTitle('Remove action')
    expect(removeButtons).toHaveLength(2)

    fireEvent.click(removeButtons[0]!)

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated = onChange.mock.calls[0][0]
    expect(updated).toHaveLength(1)
    expect(updated[0].type).toBe('set_description')
    expect(updated[0].order).toBe(0)
  })

  it('preserves action order', () => {
    const onChange = jest.fn()
    const actions: FinRuleAction[] = [
      { type: 'add_tag', target: '1', payload: null, order: 0 },
      { type: 'negate_amount', target: null, payload: null, order: 1 },
      { type: 'set_memo', target: 'memo text', payload: null, order: 2 },
    ]
    render(<ActionsEditor actions={actions} onChange={onChange} />)

    // Remove middle action
    const removeButtons = screen.getAllByTitle('Remove action')
    fireEvent.click(removeButtons[1]!)

    const updated = onChange.mock.calls[0][0]
    expect(updated).toHaveLength(2)
    expect(updated[0].type).toBe('add_tag')
    expect(updated[0].order).toBe(0)
    expect(updated[1].type).toBe('set_memo')
    expect(updated[1].order).toBe(1)
  })
})
