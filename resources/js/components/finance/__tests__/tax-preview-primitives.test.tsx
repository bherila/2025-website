import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import { DetailsButton } from '../tax-preview-primitives'

jest.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode; asChild?: boolean }) => <>{children}</>,
  TooltipContent: ({
    children,
    side,
    sideOffset,
    collisionPadding,
    className,
  }: {
    children: ReactNode
    side?: string
    sideOffset?: number
    collisionPadding?: number
    className?: string
  }) => (
    <div
      data-testid="tooltip-content"
      data-side={side}
      data-side-offset={sideOffset}
      data-collision-padding={collisionPadding}
      className={className}
    >
      {children}
    </div>
  ),
}))

describe('DetailsButton', () => {
  it('places the action tooltip to the left of the button to avoid covering adjacent Miller columns', () => {
    const onClick = jest.fn()

    render(
      <DetailsButton
        onClick={onClick}
        tooltip="List each qualified-dividend source"
        glyph="column"
      />,
    )

    const tooltip = screen.getByTestId('tooltip-content')
    expect(tooltip).toHaveAttribute('data-side', 'left')
    expect(tooltip).toHaveAttribute('data-side-offset', '8')
    expect(tooltip).toHaveAttribute('data-collision-padding', '12')
    expect(tooltip).toHaveClass('max-w-56')
    expect(screen.getByRole('button', { name: 'List each qualified-dividend source' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'List each qualified-dividend source' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
