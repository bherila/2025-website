import {
  activeGarageCells,
  applyFillPowerUp,
  applyShufflePowerUp,
  applyVipPowerUp,
  canBoardPassengerAtParkingGate,
  canMoveCar,
  type Car,
  type GameState,
  generateLevel,
  getCarCells,
  loadProgress,
  loopPassengerCapacity,
  moveCarToParking,
  type ParkingSlot,
  processBoardingAtParkingGate,
  resetGame,
  saveProgress,
  solverCompletesLevel,
  type Tunnel,
  visibleQueuePassengers,
} from '../gameEngine'

describe('cars game engine', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('generates definitely winnable levels', () => {
    for (let level = 1; level <= 10; level += 1) {
      const state = generateLevel(level, 10_000 + level)

      expect(solverCompletesLevel(state)).toBe(true)
      expect(state.passengerQueue.length).toBe(
        state.cars.reduce((total, car) => total + car.capacity, 0),
      )
    }
  })

  it('generates garage cells as real one-cell obstacles that do not overlap cars', () => {
    const state = generateLevel(8, 20_008)
    const carCells = new Set(
      state.cars
        .filter((car) => car.status !== 'departed')
        .flatMap((car) => getCarCells(car))
        .map((cell) => `${cell.x}:${cell.y}`),
    )

    for (const cell of activeGarageCells(state)) {
      expect(carCells.has(`${cell.x}:${cell.y}`)).toBe(false)
    }
  })

  it('limits the active loop to a smaller passenger buffer', () => {
    const state = generateLevel(8, 20_008)

    expect(loopPassengerCapacity(state)).toBeLessThan(state.passengerQueue.length)
    expect(visibleQueuePassengers(state)).toHaveLength(loopPassengerCapacity(state))
  })

  it('does not allow cars to cross over blocking cars', () => {
    const state = makeState({
      cars: [
        makeCar({ id: 'blocked', direction: 'right', position: { x: 0, y: 1 } }),
        makeCar({ id: 'blocker', direction: 'down', position: { x: 3, y: 1 } }),
      ],
    })

    expect(canMoveCar(state, 'blocked')).toBe(false)
    expect(moveCarToParking(state, 'blocked').lastMessage).toBe('That car is blocked by another car.')
  })

  it('supports diagonal car footprints and diagonal exit blocking', () => {
    const state = makeState({
      boardWidth: 5,
      boardHeight: 5,
      cars: [
        makeCar({ id: 'diagonal', direction: 'down-right', length: 2, position: { x: 0, y: 0 } }),
        makeCar({ id: 'blocker', direction: 'right', length: 2, position: { x: 2, y: 2 } }),
      ],
    })

    expect(getCarCells(makeCar({ direction: 'down-right', length: 3, position: { x: 1, y: 1 } }))).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ])
    expect(getCarCells(makeCar({ direction: 'up-right', length: 3, position: { x: 1, y: 1 } }))).toEqual([
      { x: 1, y: 3 },
      { x: 2, y: 2 },
      { x: 3, y: 1 },
    ])
    expect(canMoveCar(state, 'diagonal')).toBe(false)
  })

  it('reveals a hidden car color once the car is no longer obstructed', () => {
    const state = makeState({
      boardWidth: 5,
      boardHeight: 4,
      cars: [
        makeCar({ id: 'hidden-color', color: 'red', colorHidden: true, direction: 'right', position: { x: 0, y: 1 } }),
        makeCar({ id: 'blocker', color: 'blue', direction: 'down', position: { x: 2, y: 0 } }),
      ],
      passengerQueue: [
        { id: 'p1', color: 'blue' },
        { id: 'p2', color: 'blue' },
        { id: 'p3', color: 'red' },
        { id: 'p4', color: 'red' },
      ],
    })

    expect(canMoveCar(state, 'hidden-color')).toBe(false)

    const next = moveCarToParking(state, 'blocker')

    expect(next.cars.find((car) => car.id === 'hidden-color')?.colorHidden).toBe(false)
    expect(canMoveCar(next, 'hidden-color')).toBe(true)
  })

  it('boards FIFO passengers into a matching parked car and releases the slot', () => {
    const state = makeState({
      cars: [makeCar({ id: 'red-car', color: 'red', direction: 'right', position: { x: 3, y: 0 } })],
      passengerQueue: [
        { id: 'p1', color: 'red' },
        { id: 'p2', color: 'red' },
      ],
    })

    const parked = moveCarToParking(state, 'red-car')
    const oneBoarded = processBoardingAtParkingGate(parked)
    const next = processBoardingAtParkingGate(oneBoarded)

    expect(parked.cars[0]?.status).toBe('parked')
    expect(parked.passengerQueue).toHaveLength(2)
    expect(oneBoarded.cars[0]?.boarded).toBe(1)
    expect(next.cars[0]?.status).toBe('departed')
    expect(next.passengerQueue).toHaveLength(0)
    expect(next.parkingSlots.find((slot) => slot.id === 'slot-1')?.occupiedCarId).toBeNull()
    expect(next.completedLevel?.score).toBeGreaterThan(0)
  })

  it('boards only the passenger crossing the parking gate', () => {
    const state = makeState({
      cars: [makeCar({ id: 'red-car', color: 'red', direction: 'right', position: { x: 3, y: 0 } })],
      passengerQueue: [
        { id: 'p1', color: 'blue' },
        { id: 'p2', color: 'red' },
        { id: 'p3', color: 'red' },
      ],
    })

    const parked = moveCarToParking(state, 'red-car')
    const missed = processBoardingAtParkingGate(parked, 'p1')
    const boarded = processBoardingAtParkingGate(parked, 'p2')

    expect(missed).toBe(parked)
    expect(boarded.cars[0]?.boarded).toBe(1)
    expect(boarded.passengerQueue.map((passenger) => passenger.id)).toEqual(['p1', 'p3'])
  })

  it('reports whether a gate passenger has an available matching car', () => {
    const state = makeState({
      cars: [makeCar({ id: 'red-car', color: 'red', direction: 'right', position: { x: 3, y: 0 } })],
      passengerQueue: [
        { id: 'p1', color: 'blue' },
        { id: 'p2', color: 'red' },
      ],
    })

    const parked = moveCarToParking(state, 'red-car')

    expect(canBoardPassengerAtParkingGate(parked, 'p1')).toBe(false)
    expect(canBoardPassengerAtParkingGate(parked, 'p2')).toBe(true)
    expect(canBoardPassengerAtParkingGate(parked, 'p2', new Set(['red-car']))).toBe(false)
  })

  it('reveals the next hidden tunnel car and decreases the countdown', () => {
    const tunnel: Tunnel = {
      id: 'tunnel-1',
      position: { x: 3, y: 0 },
      garagePosition: { x: 2, y: 0 },
      direction: 'right',
      carIds: ['front', 'hidden'],
      visibleCarId: 'front',
      remaining: 1,
    }
    const state = makeState({
      cars: [
        makeCar({ id: 'front', color: 'red', direction: 'right', position: { x: 3, y: 0 }, tunnelId: 'tunnel-1' }),
        makeCar({ id: 'hidden', color: 'blue', direction: 'right', position: { x: 3, y: 0 }, status: 'hidden', tunnelId: 'tunnel-1' }),
      ],
      tunnels: [tunnel],
      passengerQueue: [
        { id: 'p1', color: 'red' },
        { id: 'p2', color: 'red' },
        { id: 'p3', color: 'blue' },
        { id: 'p4', color: 'blue' },
      ],
    })

    const next = moveCarToParking(state, 'front')

    expect(next.cars.find((car) => car.id === 'front')?.status).toBe('parked')
    expect(next.cars.find((car) => car.id === 'hidden')?.status).toBe('field')
    expect(next.cars.find((car) => car.id === 'hidden')?.position).toEqual({ x: 3, y: 0 })
    expect(next.tunnels[0]?.visibleCarId).toBe('hidden')
    expect(next.tunnels[0]?.remaining).toBe(0)
    expect(activeGarageCells(next)).toEqual([])
  })

  it('blocks car movement through an active garage cell', () => {
    const state = makeState({
      cars: [
        makeCar({ id: 'blocked', color: 'red', direction: 'right', position: { x: 0, y: 1 } }),
        makeCar({ id: 'front', color: 'blue', direction: 'right', position: { x: 3, y: 1 }, status: 'parked', parkingSlotId: 'slot-2', tunnelId: 'tunnel-1' }),
        makeCar({ id: 'hidden', color: 'blue', direction: 'right', position: { x: 3, y: 1 }, status: 'hidden', tunnelId: 'tunnel-1' }),
      ],
      tunnels: [{
        id: 'tunnel-1',
        position: { x: 3, y: 1 },
        garagePosition: { x: 2, y: 1 },
        direction: 'right',
        carIds: ['front', 'hidden'],
        visibleCarId: 'front',
        remaining: 1,
      }],
    })

    expect(activeGarageCells(state)).toEqual([{ x: 2, y: 1 }])
    expect(canMoveCar(state, 'blocked')).toBe(false)
  })

  it('lets VIP move a blocked car without counting as a regular parking space', () => {
    const state = makeState({
      cars: [
        makeCar({ id: 'blocked', color: 'red', direction: 'right', position: { x: 0, y: 1 } }),
        makeCar({ id: 'blocker', color: 'blue', direction: 'down', position: { x: 3, y: 1 } }),
      ],
      passengerQueue: [
        { id: 'p1', color: 'red' },
        { id: 'p2', color: 'red' },
        { id: 'p3', color: 'blue' },
        { id: 'p4', color: 'blue' },
      ],
      powerUps: { vip: 1, shuffle: 0, fill: 0 },
    })

    const vipParked = applyVipPowerUp(state, 'blocked')
    const oneBoarded = processBoardingAtParkingGate(vipParked)
    const next = processBoardingAtParkingGate(oneBoarded)

    expect(vipParked.powerUps.vip).toBe(0)
    expect(vipParked.cars.find((car) => car.id === 'blocked')?.status).toBe('parked')
    expect(next.cars.find((car) => car.id === 'blocked')?.status).toBe('departed')
    expect(next.maxRegularSlotsUsed).toBe(0)
  })

  it('shuffles active car colors into the current queue order', () => {
    const state = makeState({
      cars: [makeCar({ id: 'wrong-color', color: 'red', status: 'parked', parkingSlotId: 'slot-1' })],
      parkingSlots: makeParkingSlots('wrong-color'),
      passengerQueue: [
        { id: 'p1', color: 'blue' },
        { id: 'p2', color: 'blue' },
      ],
      powerUps: { vip: 0, shuffle: 1, fill: 0 },
    })

    const shuffled = applyShufflePowerUp(state)
    const oneBoarded = processBoardingAtParkingGate(shuffled)
    const next = processBoardingAtParkingGate(oneBoarded)

    expect(shuffled.cars[0]?.color).toBe('blue')
    expect(shuffled.cars[0]?.status).toBe('parked')
    expect(next.cars[0]?.status).toBe('departed')
    expect(next.passengerQueue).toHaveLength(0)
    expect(next.completedLevel).not.toBeNull()
  })

  it('shuffles parked cars and remaining field cars into future queue order', () => {
    const state = makeState({
      cars: [
        makeCar({ id: 'parked', color: 'red', status: 'parked', parkingSlotId: 'slot-1', sequence: 0 }),
        makeCar({ id: 'field', color: 'yellow', direction: 'right', position: { x: 0, y: 2 }, sequence: 1 }),
      ],
      parkingSlots: makeParkingSlots('parked'),
      passengerQueue: [
        { id: 'p1', color: 'blue' },
        { id: 'p2', color: 'blue' },
        { id: 'p3', color: 'green' },
        { id: 'p4', color: 'green' },
      ],
      powerUps: { vip: 0, shuffle: 1, fill: 0 },
    })

    const shuffled = applyShufflePowerUp(state)

    expect(shuffled.cars.find((car) => car.id === 'parked')?.color).toBe('blue')
    expect(shuffled.cars.find((car) => car.id === 'field')?.color).toBe('green')
    expect(shuffled.powerUps.shuffle).toBe(0)
  })

  it('fill cheats parked cars full using FIFO passengers regardless of color', () => {
    const state = makeState({
      cars: [makeCar({ id: 'parked', color: 'red', capacity: 4, length: 3, status: 'parked', parkingSlotId: 'slot-1' })],
      parkingSlots: makeParkingSlots('parked'),
      passengerQueue: [
        { id: 'p1', color: 'blue' },
        { id: 'p2', color: 'yellow' },
        { id: 'p3', color: 'purple' },
        { id: 'p4', color: 'green' },
      ],
      powerUps: { vip: 0, shuffle: 0, fill: 1 },
    })

    const next = applyFillPowerUp(state)

    expect(next.powerUps.fill).toBe(0)
    expect(next.cars[0]?.status).toBe('departed')
    expect(next.passengerQueue).toHaveLength(0)
  })

  it('saves, loads, and repairs local progress', () => {
    saveProgress({
      version: 1,
      level: 9,
      totalScore: 1200,
      highScore: 1800,
      powerUps: { vip: 1, shuffle: 2, fill: 3 },
    })

    expect(loadProgress()).toEqual({
      version: 1,
      level: 9,
      totalScore: 1200,
      highScore: 1800,
      powerUps: { vip: 1, shuffle: 2, fill: 3 },
    })

    window.localStorage.setItem('bwh.cars-game.progress.v1', 'not json')
    expect(loadProgress()).toEqual({
      version: 1,
      level: 1,
      totalScore: 0,
      highScore: 0,
      powerUps: { vip: 0, shuffle: 0, fill: 0 },
    })

    expect(resetGame().level).toBe(1)
  })
})

function makeState(overrides: Partial<GameState> = {}): GameState {
  const state: GameState = {
    version: 1,
    level: 1,
    seed: 1,
    boardWidth: 5,
    boardHeight: 3,
    cars: [],
    tunnels: [],
    passengerQueue: [],
    parkingSlots: makeParkingSlots(),
    powerUps: { vip: 0, shuffle: 0, fill: 0 },
    levelScore: 1000,
    totalScore: 0,
    highScore: 0,
    moves: 0,
    maxRegularSlotsUsed: 0,
    maxRegularSlotsUnlocked: 4,
    lastMessage: '',
    completedLevel: null,
  }

  return {
    ...state,
    ...overrides,
    cars: overrides.cars ?? state.cars,
    tunnels: overrides.tunnels ?? state.tunnels,
    passengerQueue: overrides.passengerQueue ?? state.passengerQueue,
    parkingSlots: overrides.parkingSlots ?? state.parkingSlots,
    powerUps: overrides.powerUps ?? state.powerUps,
  }
}

function makeCar(overrides: Partial<Car> = {}): Car {
  return {
    id: 'car-1',
    color: 'red',
    colorHidden: false,
    direction: 'right',
    capacity: 2,
    length: 2,
    position: { x: 0, y: 0 },
    status: 'field',
    parkingSlotId: null,
    boarded: 0,
    tunnelId: null,
    sequence: 0,
    ...overrides,
  }
}

function makeParkingSlots(occupiedCarId: string | null = null): ParkingSlot[] {
  return [
    { id: 'vip', kind: 'vip', unlocked: true, occupiedCarId: null, index: -1 },
    { id: 'slot-1', kind: 'regular', unlocked: true, occupiedCarId, index: 0 },
    { id: 'slot-2', kind: 'regular', unlocked: true, occupiedCarId: null, index: 1 },
    { id: 'slot-3', kind: 'regular', unlocked: true, occupiedCarId: null, index: 2 },
    { id: 'slot-4', kind: 'regular', unlocked: true, occupiedCarId: null, index: 3 },
    { id: 'slot-5', kind: 'regular', unlocked: false, occupiedCarId: null, index: 4 },
  ]
}
