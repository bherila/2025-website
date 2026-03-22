import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import { OrderControls } from '../OrderControls'

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

describe('OrderControls', () => {
  it('renders up and down arrows', () => {
    render(
      <OrderControls onMoveUp={jest.fn()} onMoveDown={jest.fn()} isFirst={false} isLast={false} />,
    )
    expect(screen.getByTitle('Move up')).toBeInTheDocument()
    expect(screen.getByTitle('Move down')).toBeInTheDocument()
  })

  it('calls onMoveUp when up arrow clicked', () => {
    const onMoveUp = jest.fn()
    render(
      <OrderControls onMoveUp={onMoveUp} onMoveDown={jest.fn()} isFirst={false} isLast={false} />,
    )
    fireEvent.click(screen.getByTitle('Move up'))
    expect(onMoveUp).toHaveBeenCalledTimes(1)
  })

  it('calls onMoveDown when down arrow clicked', () => {
    const onMoveDown = jest.fn()
    render(
      <OrderControls onMoveUp={jest.fn()} onMoveDown={onMoveDown} isFirst={false} isLast={false} />,
    )
    fireEvent.click(screen.getByTitle('Move down'))
    expect(onMoveDown).toHaveBeenCalledTimes(1)
  })

  it('disables up arrow when isFirst=true', () => {
    render(
      <OrderControls onMoveUp={jest.fn()} onMoveDown={jest.fn()} isFirst={true} isLast={false} />,
    )
    expect(screen.getByTitle('Move up')).toBeDisabled()
    expect(screen.getByTitle('Move down')).not.toBeDisabled()
  })

  it('disables down arrow when isLast=true', () => {
    render(
      <OrderControls onMoveUp={jest.fn()} onMoveDown={jest.fn()} isFirst={false} isLast={true} />,
    )
    expect(screen.getByTitle('Move up')).not.toBeDisabled()
    expect(screen.getByTitle('Move down')).toBeDisabled()
  })
})
