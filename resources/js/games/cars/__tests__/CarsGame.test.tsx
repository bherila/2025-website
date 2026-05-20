import { fireEvent, render, screen } from '@testing-library/react'

import { CarsGame } from '../CarsGame'
import { GAME_PROGRESS_STORAGE_KEY } from '../gameEngine'
import { CARS_TUTORIAL_STORAGE_KEY } from '../TutorialOverlay'

jest.mock('../CarsScene', () => ({
  CarsScene: ({ vipSelectionActive }: { vipSelectionActive: boolean }) => (
    <div data-testid="cars-scene" data-vip-selection={vipSelectionActive ? 'active' : 'inactive'} />
  ),
}))

describe('CarsGame', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem(CARS_TUTORIAL_STORAGE_KEY, '1')
  })

  it('mounts the game controls and Three.js scene shell', () => {
    render(<CarsGame />)

    expect(screen.getAllByText('Level').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'VIP' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shuffle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fill' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Spot' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tutorial' })).toBeInTheDocument()
    expect(screen.getByTestId('cars-scene')).toHaveAttribute('data-vip-selection', 'inactive')
  })

  it('shows hard difficulty indicators on every fifth level', () => {
    window.localStorage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify({
      highScore: 0,
      level: 5,
      powerUps: { fill: 0, shuffle: 0, vip: 0 },
      totalScore: 0,
      version: 1,
    }))

    render(<CarsGame />)

    expect(screen.getAllByText('HARD').length).toBeGreaterThan(0)
  })

  it('shows super hard difficulty indicators on every twentieth level', () => {
    window.localStorage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify({
      highScore: 0,
      level: 20,
      powerUps: { fill: 0, shuffle: 0, vip: 0 },
      totalScore: 0,
      version: 1,
    }))

    render(<CarsGame />)

    expect(screen.getAllByText('SUPER HARD').length).toBeGreaterThan(0)
  })

  it('confirms VIP power-up use before arming selection mode', () => {
    window.localStorage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify({
      highScore: 0,
      level: 1,
      powerUps: { fill: 1, shuffle: 1, vip: 1 },
      totalScore: 0,
      version: 1,
    }))

    render(<CarsGame />)

    fireEvent.click(screen.getByRole('button', { name: 'VIP' }))

    expect(screen.getByText('Use VIP power-up?')).toBeInTheDocument()
    expect(screen.getByText(/bypassing normal blocking/i)).toBeInTheDocument()
    expect(screen.getByTestId('cars-scene')).toHaveAttribute('data-vip-selection', 'inactive')

    fireEvent.click(screen.getByRole('button', { name: 'Use VIP' }))

    expect(screen.getByTestId('cars-scene')).toHaveAttribute('data-vip-selection', 'active')
  })
})
