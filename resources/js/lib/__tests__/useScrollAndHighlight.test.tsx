import { act, render, screen } from '@testing-library/react'
import type React from 'react'

import { useScrollAndHighlight } from '@/lib/useScrollAndHighlight'

interface HarnessProps {
  enabled?: boolean
  triggerKey?: string
}

function Harness({ enabled = true, triggerKey = 'first' }: HarnessProps): React.ReactElement {
  useScrollAndHighlight({
    selector: '[data-testid="target"]',
    triggerKey,
    enabled,
    delayMs: 10,
    durationMs: 20,
  })

  return <div data-testid="target" />
}

describe('useScrollAndHighlight', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('scrolls to the selector and removes the highlight after the duration', () => {
    const scrollIntoView = jest.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView

    render(<Harness />)

    act(() => {
      jest.advanceTimersByTime(10)
    })

    const target = screen.getByTestId('target')
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(target).toHaveClass('scroll-highlight-flash')

    act(() => {
      jest.advanceTimersByTime(20)
    })

    expect(target).not.toHaveClass('scroll-highlight-flash')
  })

  it('does nothing when disabled', () => {
    const scrollIntoView = jest.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView

    render(<Harness enabled={false} />)

    act(() => {
      jest.advanceTimersByTime(10)
    })

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(screen.getByTestId('target')).not.toHaveClass('scroll-highlight-flash')
  })
})
