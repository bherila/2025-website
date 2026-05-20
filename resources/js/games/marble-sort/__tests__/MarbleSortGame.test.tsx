import { fireEvent, render, screen } from '@testing-library/react'

import { MARBLE_SORT_PROGRESS_STORAGE_KEY } from '../gameEngine'
import { MarbleSortGame } from '../MarbleSortGame'
import { MARBLE_SORT_TUTORIAL_STORAGE_KEY } from '../TutorialOverlay'

jest.mock('../MarbleSortScene', () => ({
  MarbleSortScene: ({ colorblindMode }: { colorblindMode: boolean }) => (
    <div data-colorblind-mode={colorblindMode ? 'enabled' : 'disabled'} data-testid="marble-sort-scene" />
  ),
}))

describe('MarbleSortGame', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem(MARBLE_SORT_TUTORIAL_STORAGE_KEY, '1')
  })

  it('mounts the game controls and Three.js scene shell', () => {
    render(<MarbleSortGame />)

    expect(screen.getAllByText('Level').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Magnet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shuffle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Extra Belt' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tutorial' })).toBeInTheDocument()
    expect(screen.getByTestId('marble-sort-scene')).toHaveAttribute('data-colorblind-mode', 'disabled')
  })

  it('confirms power-up use before applying the action', () => {
    window.localStorage.setItem(MARBLE_SORT_PROGRESS_STORAGE_KEY, JSON.stringify({
      highScore: 0,
      level: 1,
      powerUps: { extraBelt: 1, magnet: 1, shuffle: 1 },
      totalScore: 0,
      version: 1,
    }))

    render(<MarbleSortGame />)

    fireEvent.click(screen.getByRole('button', { name: 'Extra Belt' }))

    expect(screen.getByText('Use Extra Belt?')).toBeInTheDocument()
    expect(screen.getByText(/adds room for one more opened box/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Use Extra Belt' }))

    expect(screen.getByText(/Extra Belt added room/i)).toBeInTheDocument()
  })
})
