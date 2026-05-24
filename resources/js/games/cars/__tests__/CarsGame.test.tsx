import { fireEvent, render, screen } from '@testing-library/react'

import { CarsGame } from '../CarsGame'
import { GAME_PROGRESS_STORAGE_KEY, LEVEL_SNAPSHOT_STORAGE_KEY } from '../gameEngine'
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
    window.history.replaceState(null, '', '/')
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
    expect(screen.getByTestId('portrait-game-viewport').getAttribute('style')).toContain('calc(100vh * 3 / 4)')
  })

  it('shows hard difficulty indicators on every fifth level', () => {
    window.localStorage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify({
      highScore: 0,
      level: 5,
      powerUps: { fill: 0, shuffle: 0, vip: 0 },
      totalScore: 0,
      version: 2,
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
      version: 2,
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
      version: 2,
    }))

    render(<CarsGame />)

    fireEvent.click(screen.getByRole('button', { name: 'VIP' }))

    expect(screen.getByText('Use VIP power-up?')).toBeInTheDocument()
    expect(screen.getByText(/bypassing normal blocking/i)).toBeInTheDocument()
    expect(screen.getByTestId('cars-scene')).toHaveAttribute('data-vip-selection', 'inactive')

    fireEvent.click(screen.getByRole('button', { name: 'Use VIP' }))

    expect(screen.getByTestId('cars-scene')).toHaveAttribute('data-vip-selection', 'active')
  })

  it('preserves the saved level snapshot when Reset is clicked in visual test mode', () => {
    const savedSnapshot = JSON.stringify({ version: 2, marker: 'user-progress' })
    window.localStorage.setItem(LEVEL_SNAPSHOT_STORAGE_KEY, savedSnapshot)
    window.history.replaceState(null, '', '/?visualTest=1&level=3')

    render(<CarsGame />)

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(window.localStorage.getItem(LEVEL_SNAPSHOT_STORAGE_KEY)).toBe(savedSnapshot)
  })

  it('expands the mobile stats overlay when visualTest hud=normal', () => {
    window.history.replaceState(null, '', '/?visualTest=1&level=1&hud=normal')

    render(<CarsGame />)

    const expandable = screen.getByText('Total Score').parentElement?.parentElement
    expect(expandable).not.toHaveClass('hidden')
  })

  it('keeps the mobile stats overlay collapsed when visualTest hud is absent', () => {
    window.history.replaceState(null, '', '/?visualTest=1&level=1')

    render(<CarsGame />)

    const expandable = screen.getByText('Total Score').parentElement?.parentElement
    expect(expandable).toHaveClass('hidden')
  })
})
