import { fireEvent, render, screen } from '@testing-library/react'

import { MillerDockSection } from '../MillerDockHome'

type TestId = 'summary' | 'labs'

describe('MillerDockSection', () => {
  it('renders launch tiles with amounts, badges, and pin controls', () => {
    const onOpen = jest.fn()
    const onTogglePin = jest.fn()

    render(
      <MillerDockSection<TestId>
        title="Pinned"
        entries={[
          {
            id: 'labs',
            label: 'Labs',
            shortLabel: 'Labs',
            amounts: [{ label: 'Records', value: '12' }],
            badge: <span>2</span>,
          },
        ]}
        onOpen={onOpen}
        isPinned={(id) => id === 'labs'}
        onTogglePin={onTogglePin}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Labs Labs Records 12/i }))
    expect(onOpen).toHaveBeenCalledWith('labs')
    expect(screen.getByText('2')).toBeInTheDocument()

    const pinButton = screen.getByRole('button', { name: 'Unpin Labs' })
    expect(pinButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(pinButton)
    expect(onTogglePin).toHaveBeenCalledWith('labs')
  })

  it('hides pin controls for entries that opt out', () => {
    render(
      <MillerDockSection<TestId>
        title="Recent"
        entries={[{ id: 'summary', label: 'Summary', shortLabel: 'Summary', canPin: false }]}
        onOpen={jest.fn()}
        isPinned={() => false}
        onTogglePin={jest.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Pin Summary' })).not.toBeInTheDocument()
  })
})
