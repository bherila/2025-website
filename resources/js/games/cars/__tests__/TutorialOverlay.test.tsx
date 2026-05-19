import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'
import { type ReactNode } from 'react'

import {
  CARS_TUTORIAL_STEPS,
  CARS_TUTORIAL_STORAGE_KEY,
  TutorialOverlay,
} from '../TutorialOverlay'

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; onOpenChange?: (open: boolean) => void; open?: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode; showCloseButton?: boolean }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

describe('TutorialOverlay', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the first tutorial step when open', () => {
    render(<TutorialOverlay open onOpenChange={jest.fn()} />)

    expect(screen.getByRole('heading', { name: 'Parking Pickup' })).toBeInTheDocument()
    expect(screen.getByText(CARS_TUTORIAL_STEPS[0])).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /got it/i })).toBeInTheDocument()
  })

  it('advances through the tutorial and marks it seen on completion', () => {
    const handleOpenChange = jest.fn()

    render(<TutorialOverlay open onOpenChange={handleOpenChange} />)

    fireEvent.click(screen.getByRole('button', { name: /got it/i }))
    expect(screen.getByText(CARS_TUTORIAL_STEPS[1])).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(CARS_TUTORIAL_STEPS[2])).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /start playing/i }))

    expect(window.localStorage.getItem(CARS_TUTORIAL_STORAGE_KEY)).toBe('1')
    expect(handleOpenChange).toHaveBeenCalledWith(false)
  })
})
