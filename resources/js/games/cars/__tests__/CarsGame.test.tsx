import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { playSfx, setMuted } from '../audio/audioManager'
import { CarsGame } from '../CarsGame'
import { AUDIO_MUTED_STORAGE_KEY } from '../GameControls'
import { BOARD_HEIGHT, BOARD_WIDTH, type Car, GAME_PROGRESS_STORAGE_KEY, type GameState, LEVEL_SNAPSHOT_STORAGE_KEY, type ParkingSlot } from '../gameEngine'
import { CARS_TUTORIAL_STORAGE_KEY } from '../TutorialOverlay'

jest.mock('../audio/audioManager', () => ({
  playSfx: jest.fn(),
  preloadSfx: jest.fn(() => Promise.resolve()),
  setMuted: jest.fn(),
}))

jest.mock('../CarsScene', () => {
  const engine = jest.requireActual('../gameEngine') as typeof import('../gameEngine')

  return {
    CarsScene: ({
      state,
      vipSelectionActive,
      onCarClick,
      onPassengerGate,
    }: {
      state: import('../gameEngine').GameState
      vipSelectionActive: boolean
      onCarClick: (carId: string) => void
      onPassengerGate: (passengerId: string) => void
    }) => {
      const movableCar = state.cars.find((car) => car.status === 'field' && engine.canMoveCar(state, car.id))
      const blockedCar = state.cars.find((car) => car.status === 'field' && !engine.canMoveCar(state, car.id))
      const boardablePassenger = state.passengerQueue.find((passenger) => engine.canBoardPassengerAtParkingGate(state, passenger.id))
      const boardablePassengers = state.passengerQueue.filter((passenger) => engine.canBoardPassengerAtParkingGate(state, passenger.id))

      return (
        <div data-queue-length={state.passengerQueue.length} data-testid="cars-scene" data-vip-selection={vipSelectionActive ? 'active' : 'inactive'}>
          <button disabled={!movableCar} type="button" onClick={() => movableCar && onCarClick(movableCar.id)}>Move mock car</button>
          <button disabled={!blockedCar} type="button" onClick={() => blockedCar && onCarClick(blockedCar.id)}>Blocked mock car</button>
          <button disabled={!boardablePassenger} type="button" onClick={() => boardablePassenger && onPassengerGate(boardablePassenger.id)}>Board mock passenger</button>
          <button disabled={boardablePassengers.length === 0} type="button" onClick={() => boardablePassengers.forEach((passenger) => onPassengerGate(passenger.id))}>Board all mock passengers</button>
        </div>
      )
    },
  }
})

describe('CarsGame', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem(CARS_TUTORIAL_STORAGE_KEY, '1')
    window.history.replaceState(null, '', '/')
    jest.clearAllMocks()
  })

  it('mounts the game controls and Three.js scene shell', () => {
    render(<CarsGame />)

    expect(screen.getAllByText('Level').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'VIP' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shuffle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fill' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Spot' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tutorial' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mute audio' })).toBeInTheDocument()
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

  it('persists the audio mute toggle', () => {
    render(<CarsGame />)

    expect(setMuted).toHaveBeenLastCalledWith(false)

    fireEvent.click(screen.getByRole('button', { name: 'Mute audio' }))

    expect(setMuted).toHaveBeenLastCalledWith(true)
    expect(window.localStorage.getItem(AUDIO_MUTED_STORAGE_KEY)).toBe('1')
    expect(screen.getByRole('button', { name: 'Unmute audio' })).toBeInTheDocument()
  })

  it('restores the persisted audio mute preference', () => {
    window.localStorage.setItem(AUDIO_MUTED_STORAGE_KEY, '1')

    render(<CarsGame />)

    expect(screen.getByRole('button', { name: 'Unmute audio' })).toBeInTheDocument()
    expect(setMuted).toHaveBeenLastCalledWith(true)
  })

  it('plays parking, boarding, and completion sound effects at game transitions', async () => {
    saveAudioTestSnapshot(makeAudioTestState({
      cars: [makeAudioTestCar({ id: 'red-car' })],
      passengerQueue: [
        { id: 'p1', color: 'red' },
        { id: 'p2', color: 'red' },
      ],
    }))

    render(<CarsGame />)

    fireEvent.click(screen.getByRole('button', { name: 'Move mock car' }))
    expect(playSfx).toHaveBeenCalledWith('car-park-success')

    fireEvent.click(screen.getByRole('button', { name: 'Board mock passenger' }))
    expect(playSfx).toHaveBeenCalledWith('passenger-board')

    fireEvent.click(screen.getByRole('button', { name: 'Board mock passenger' }))

    expect(playSfx).toHaveBeenCalledWith('passenger-board')
    await waitFor(() => expect(playSfx).toHaveBeenCalledWith('level-complete'))
  })

  it('plays the blocked-car sound effect when a blocked car attempt is set', () => {
    saveAudioTestSnapshot(makeAudioTestState({
      cars: [
        makeAudioTestCar({ id: 'blocked-car', position: { x: 20, y: 2 }, sequence: 0 }),
        makeAudioTestCar({ id: 'blocker-car', position: { x: 22, y: 2 }, sequence: 1 }),
      ],
    }))

    render(<CarsGame />)

    fireEvent.click(screen.getByRole('button', { name: 'Blocked mock car' }))

    expect(playSfx).toHaveBeenCalledWith('car-blocked')
  })

  it('applies synchronous passenger boarding notifications cumulatively', async () => {
    saveAudioTestSnapshot(makeAudioTestState({
      cars: [makeAudioTestCar({ id: 'red-car', status: 'parked', parkingSlotId: 'slot-1' })],
      parkingSlots: makeAudioTestParkingSlots().map((slot) => (
        slot.id === 'slot-1' ? { ...slot, occupiedCarId: 'red-car' } : slot
      )),
      passengerQueue: [
        { id: 'p1', color: 'red' },
        { id: 'p2', color: 'red' },
      ],
    }))

    render(<CarsGame />)

    fireEvent.click(screen.getByRole('button', { name: 'Board all mock passengers' }))

    await waitFor(() => expect(screen.getByTestId('cars-scene')).toHaveAttribute('data-queue-length', '0'))
    expect((playSfx as jest.Mock).mock.calls.filter(([name]) => name === 'passenger-board')).toEqual([
      ['passenger-board'],
      ['passenger-board'],
    ])
  })
})

function saveAudioTestSnapshot(state: GameState): void {
  window.localStorage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify({
    highScore: state.highScore,
    level: state.level,
    powerUps: state.powerUps,
    totalScore: state.totalScore,
    version: 2,
  }))
  window.localStorage.setItem(LEVEL_SNAPSHOT_STORAGE_KEY, JSON.stringify({ version: 2, state }))
}

function makeAudioTestState(overrides: Partial<GameState> = {}): GameState {
  const state: GameState = {
    version: 2,
    level: 1,
    seed: 565,
    boardWidth: BOARD_WIDTH,
    boardHeight: BOARD_HEIGHT,
    cars: [],
    tunnels: [],
    passengerQueue: [],
    parkingSlots: makeAudioTestParkingSlots(),
    powerUps: { vip: 0, shuffle: 0, fill: 0 },
    levelScore: 1000,
    totalScore: 0,
    highScore: 0,
    moves: 0,
    maxRegularSlotsUsed: 0,
    maxRegularSlotsUnlocked: 4,
    lastMessage: 'Audio test level ready.',
    completedLevel: null,
    failedLevel: null,
  }

  return {
    ...state,
    ...overrides,
    cars: overrides.cars ?? state.cars,
    tunnels: overrides.tunnels ?? state.tunnels,
    passengerQueue: overrides.passengerQueue ?? state.passengerQueue,
    parkingSlots: overrides.parkingSlots ?? state.parkingSlots,
    powerUps: overrides.powerUps ?? state.powerUps,
    completedLevel: overrides.completedLevel ?? state.completedLevel,
    failedLevel: overrides.failedLevel ?? state.failedLevel,
  }
}

function makeAudioTestCar(overrides: Partial<Car> = {}): Car {
  return {
    id: 'car-1',
    color: 'red',
    colorHidden: false,
    direction: 'right',
    capacity: 2,
    length: 2,
    position: { x: 22, y: 1 },
    status: 'field',
    parkingSlotId: null,
    boarded: 0,
    tunnelId: null,
    sequence: 0,
    ...overrides,
  }
}

function makeAudioTestParkingSlots(): ParkingSlot[] {
  return [
    { id: 'vip', kind: 'vip', unlocked: true, occupiedCarId: null, index: -1 },
    { id: 'slot-1', kind: 'regular', unlocked: true, occupiedCarId: null, index: 0 },
    { id: 'slot-2', kind: 'regular', unlocked: true, occupiedCarId: null, index: 1 },
    { id: 'slot-3', kind: 'regular', unlocked: true, occupiedCarId: null, index: 2 },
    { id: 'slot-4', kind: 'regular', unlocked: true, occupiedCarId: null, index: 3 },
    { id: 'slot-5', kind: 'regular', unlocked: false, occupiedCarId: null, index: 4 },
  ]
}
