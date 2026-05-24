import {
  activeGarageCells,
  applyFillPowerUp,
  applyShufflePowerUp,
  applyVipPowerUp,
  calculateLevelScore,
  canBoardPassengerAtParkingGate,
  canMoveCar,
  type Car,
  directionStep,
  findSolvingOrder,
  type GameState,
  generateLevel,
  getCarCells,
  getCarOccupiedCells,
  getLevelDifficulty,
  lengthForCapacity,
  levelHasAvailableRescue,
  loadProgress,
  loopPassengerCapacity,
  moveCarToParking,
  openParkingSlot,
  type ParkingSlot,
  pathCellsToExit,
  type PlannedSolution,
  processBoardingAtParkingGate,
  resetGame,
  saveProgress,
  solverCompletesLevel,
  STARTING_REGULAR_SLOTS,
  type Tunnel,
  validateParkingSolution,
  visibleQueuePassengers,
} from '../gameEngine'

const QUEUE_SAFE_FEEDER_LOOKAHEAD_FOR_TEST = 12

describe('cars game engine', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('generates levels with queue-aware solutions that do not need extra slots', () => {
    for (const level of [1, 2, 3, 4, 5, 8, 10, 20, 78]) {
      const state = generateLevel(level)
      const order = findSolvingOrder(state)
      const solution = validateParkingSolution(state, order ?? [])

      if (!solverCompletesLevel(state)) {
        throw new Error(`Generated level ${level} is not board-solvable: ${state.lastMessage}`)
      }
      expect(order).not.toBeNull()
      if (!solution) {
        throw new Error(`Generated level ${level} has no queue-aware parking solution`)
      }
      expect(solution?.maxRegularSlotsUsed).toBeLessThanOrEqual(STARTING_REGULAR_SLOTS)
      expect(state.passengerQueue.length).toBe(
        state.cars.reduce((total, car) => total + car.capacity, 0),
      )
    }
  })

  it('generates visually denser tutorial and advanced levels', () => {
    expect(generateLevel(1).cars).toHaveLength(20)
    expect(generateLevel(2).cars).toHaveLength(23)
    expect(generateLevel(3).cars).toHaveLength(26)
    expect(generateLevel(4).cars.length).toBeGreaterThanOrEqual(28)
    expect(generateLevel(100).cars.length).toBeLessThanOrEqual(72)
  })

  it('adds strategic queue pressure after the tutorial levels', () => {
    const sampledSolutions = new Map<number, PlannedSolution>()

    for (const level of [4, 5, 9, 10, 15, 20, 40]) {
      const state = generateLevel(level)
      const order = findSolvingOrder(state)
      const solution = validateParkingSolution(state, order ?? [])

      if (!solution) {
        throw new Error(`Generated level ${level} has no strategic pressure solution`)
      }
      sampledSolutions.set(level, solution as PlannedSolution)
      expect(queueExactlyMirrorsSolvingBlocks(state, order ?? [])).toBe(false)
    }

    expect(sampledSolutions.get(4)?.metrics.decisionPointCount).toBeGreaterThanOrEqual(1)
    expect(sampledSolutions.get(4)?.metrics.plannedMaxOccupancy).toBeGreaterThanOrEqual(2)

    expect(sampledSolutions.get(10)?.metrics.decisionPointCount).toBeGreaterThanOrEqual(2)
    expect(sampledSolutions.get(10)?.metrics.plannedMaxOccupancy).toBeGreaterThanOrEqual(3)
    expect(sampledSolutions.get(10)?.metrics.wrongMoveTrapCount).toBeGreaterThanOrEqual(1)

    expect(sampledSolutions.get(20)?.metrics.decisionPointCount).toBeGreaterThanOrEqual(3)
    expect(sampledSolutions.get(20)?.metrics.plannedMaxOccupancy).toBeGreaterThanOrEqual(4)
    expect(sampledSolutions.get(20)?.metrics.wrongMoveTrapCount).toBeGreaterThanOrEqual(2)
  })

  it('constructs delayed-color decoys at decision points', () => {
    for (const level of [4, 10, 20, 40]) {
      const state = generateLevel(level)
      const order = findSolvingOrder(state) ?? []
      const solution = validateParkingSolution(state, order)

      if (!solution) {
        throw new Error(`Generated level ${level} has no strategic pressure solution`)
      }

      for (const decisionPoint of solution.decisionPoints) {
        const decisionState = stateAtDecisionStep(state, solution.order, decisionPoint.step)
        const intendedCar = state.cars.find((car) => car.id === decisionPoint.intendedCarId)
        if (!intendedCar) {
          throw new Error(`Missing intended car ${decisionPoint.intendedCarId}`)
        }

        for (const decoyCarId of decisionPoint.decoyCarIds) {
          const decoyCar = state.cars.find((car) => car.id === decoyCarId)
          if (!decoyCar) {
            throw new Error(`Missing decoy car ${decoyCarId}`)
          }

          const passengerWindow = decisionState.passengerQueue.slice(
            0,
            loopPassengerCapacity(decisionState) + QUEUE_SAFE_FEEDER_LOOKAHEAD_FOR_TEST,
          )
          const visibleDecoyMatches = passengerWindow.filter((passenger) => passenger.color === decoyCar.color).length

          if (decoyCar.color === intendedCar.color) {
            throw new Error(`Level ${level} decision ${decisionPoint.step} decoy ${decoyCar.id} shares ${decoyCar.color} with intended ${intendedCar.id}`)
          }
          expect(visibleDecoyMatches).toBeLessThan(Math.min(decoyCar.capacity, Math.max(2, decoyCar.capacity - 1)))
        }
      }
    }
  })

  it('maps capacity to the intended grid length', () => {
    expect(lengthForCapacity(4)).toBe(2)
    expect(lengthForCapacity(6)).toBe(3)
    expect(lengthForCapacity(10)).toBe(4)
  })

  it('applies difficulty cadence, loop capacity, and score multipliers', () => {
    const passengers = Array.from({ length: 50 }, (_, index) => ({
      color: 'red' as const,
      id: `p${index + 1}`,
    }))

    expect(getLevelDifficulty(4)).toMatchObject({ kind: 'regular', label: '', scoreMultiplier: 1 })
    expect(getLevelDifficulty(5)).toMatchObject({ kind: 'hard', label: 'HARD', scoreMultiplier: 2 })
    expect(getLevelDifficulty(20)).toMatchObject({ kind: 'super-hard', label: 'SUPER HARD', scoreMultiplier: 3 })

    expect(loopPassengerCapacity(makeState({ level: 1, passengerQueue: passengers }))).toBe(18)
    expect(loopPassengerCapacity(makeState({ level: 4, passengerQueue: passengers }))).toBe(20)
    expect(loopPassengerCapacity(makeState({ level: 5, passengerQueue: passengers }))).toBe(12)
    expect(loopPassengerCapacity(makeState({ level: 20, passengerQueue: passengers }))).toBe(13)

    expect(calculateLevelScore(makeState({ level: 4 }))).toBe(1440)
    expect(calculateLevelScore(makeState({ level: 5 }))).toBe(3100)
    expect(calculateLevelScore(makeState({ level: 20 }))).toBe(9600)
  })

  it('allows only the visible tunnel car tail to overlap an active garage cell', () => {
    const state = generateLevel(8, 20_008)

    expect(activeGarageCells(state).length).toBeGreaterThan(0)

    for (const tunnel of state.tunnels.filter((candidate) => candidate.remaining > 0)) {
      const visibleCar = state.cars.find((car) => car.id === tunnel.visibleCarId)
      if (!visibleCar) {
        throw new Error(`Expected visible car for ${tunnel.id}`)
      }

      expect(visibleCar).toBeDefined()
      expect(visibleCar.status).toBe('field')
      expect(tunnel.garagePosition).toEqual(backCellForTest(visibleCar))
      expect(getCarCells(visibleCar).filter((cell) => gridCellKeyForTest(cell) === gridCellKeyForTest(tunnel.garagePosition))).toHaveLength(1)
    }

    const visibleFieldCells = new Map<string, string>()
    for (const car of state.cars.filter((candidate) => candidate.status === 'field')) {
      for (const cell of getCarOccupiedCells(car, state)) {
        const key = gridCellKeyForTest(cell)

        expect(visibleFieldCells.get(key)).toBeUndefined()
        visibleFieldCells.set(key, car.id)
      }
    }
  })

  it('keeps generated diagonal cars clear of adjacent visual-overlap cells', () => {
    const states = [
      generateLevel(8, 20_008),
      generateLevel(10, 20_010),
    ]
    const diagonalCars = states
      .flatMap((state) => state.cars.filter((car) => car.status === 'field' && car.direction.includes('-')))

    expect(diagonalCars.length).toBeGreaterThan(0)

    for (const state of states) {
      const occupiedCells = new Map<string, string>()
      for (const car of state.cars.filter((candidate) => candidate.status === 'field')) {
        for (const cell of getCarOccupiedCells(car, state)) {
          const key = gridCellKeyForTest(cell)
          const occupyingCarId = occupiedCells.get(key)

          expect(occupyingCarId).toBeUndefined()
          occupiedCells.set(key, car.id)
        }
      }
    }
  })

  it('expands diagonal occupied footprints for every diagonal direction', () => {
    const board = { boardWidth: 5, boardHeight: 5 }
    const descendingFootprint = sortCells([
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
    ])
    const ascendingFootprint = sortCells([
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
    ])

    expect(sortCells(getCarOccupiedCells(makeCar({ direction: 'down-right', length: 3, position: { x: 1, y: 1 } }), board))).toEqual(descendingFootprint)
    expect(sortCells(getCarOccupiedCells(makeCar({ direction: 'up-left', length: 3, position: { x: 1, y: 1 } }), board))).toEqual(descendingFootprint)
    expect(sortCells(getCarOccupiedCells(makeCar({ direction: 'up-right', length: 3, position: { x: 1, y: 1 } }), board))).toEqual(ascendingFootprint)
    expect(sortCells(getCarOccupiedCells(makeCar({ direction: 'down-left', length: 3, position: { x: 1, y: 1 } }), board))).toEqual(ascendingFootprint)
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

  it('blocks diagonal movement through swept footprint cells outside the center-line path', () => {
    const diagonal = makeCar({ id: 'diagonal', direction: 'down-right', length: 2, position: { x: 0, y: 0 }, sequence: 0 })
    const blocker = makeCar({ id: 'blocker', direction: 'right', length: 2, position: { x: 2, y: 1 }, sequence: 1 })
    const state = makeState({
      boardWidth: 5,
      boardHeight: 5,
      cars: [diagonal, blocker],
    })

    expect(pathCellsToExit(diagonal, state.boardWidth, state.boardHeight)).not.toContainEqual({ x: 2, y: 1 })
    expect(getCarOccupiedCells({ ...diagonal, position: { x: 1, y: 1 } }, state)).toContainEqual({ x: 2, y: 1 })
    expect(canMoveCar(state, 'diagonal')).toBe(false)
    expect(findSolvingOrder(state)).toEqual(['blocker', 'diagonal'])
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

  it('fails a level when no boarding, moves, slots, or power-ups can rescue it', () => {
    const state = makeNoRescueState()

    expect(levelHasAvailableRescue(state)).toBe(false)

    const next = processBoardingAtParkingGate(state, 'p1')

    expect(next).not.toBe(state)
    expect(next.failedLevel).toEqual({
      level: 1,
      reason: 'No moves left. Restart the level to try again.',
    })
    expect(next.lastMessage).toBe('No moves left. Restart the level to try again.')
  })

  it('keeps the level alive while any rescue action remains available', () => {
    const baseState = makeNoRescueState()
    const rescuableStates: GameState[] = [
      makeNoRescueState({
        passengerQueue: [
          { id: 'p1', color: 'red' },
          { id: 'p2', color: 'red' },
        ],
      }),
      makeNoRescueState({
        cars: [
          ...baseState.cars,
          makeCar({ id: 'field', color: 'blue', direction: 'right', position: { x: 0, y: 2 } }),
        ],
        parkingSlots: makeNoRescueParkingSlots().map((slot) => slot.id === 'slot-2'
          ? { ...slot, occupiedCarId: null }
          : slot),
      }),
      makeNoRescueState({
        parkingSlots: makeNoRescueParkingSlots().map((slot) => slot.id === 'slot-5'
          ? { ...slot, occupiedCarId: null, unlocked: false }
          : slot),
      }),
      makeNoRescueState({
        cars: [
          ...baseState.cars,
          makeCar({ id: 'vip-field', color: 'blue', direction: 'right', position: { x: 0, y: 2 } }),
        ],
        powerUps: { fill: 0, shuffle: 0, vip: 1 },
      }),
      makeNoRescueState({
        powerUps: { fill: 0, shuffle: 1, vip: 0 },
      }),
      makeNoRescueState({
        powerUps: { fill: 1, shuffle: 0, vip: 0 },
      }),
    ]

    for (const state of rescuableStates) {
      expect(levelHasAvailableRescue(state)).toBe(true)
      expect(processBoardingAtParkingGate(state, 'p1').failedLevel).toBeNull()
    }
  })

  it('blocks state-changing actions after a level has failed', () => {
    const failedState = makeState({
      cars: [makeCar({ id: 'field', color: 'blue', direction: 'right', position: { x: 0, y: 2 } })],
      failedLevel: {
        level: 1,
        reason: 'No moves left. Restart the level to try again.',
      },
      parkingSlots: makeParkingSlots().map((slot) => slot.id === 'slot-5'
        ? { ...slot, unlocked: false }
        : slot),
      powerUps: { fill: 0, shuffle: 1, vip: 0 },
    })

    expect(canMoveCar(failedState, 'field')).toBe(false)
    expect(moveCarToParking(failedState, 'field')).toEqual(failedState)
    expect(openParkingSlot(failedState)).toEqual(failedState)
    expect(applyShufflePowerUp(failedState)).toEqual(failedState)
  })

  it('saves, loads, and repairs local progress', () => {
    saveProgress({
      version: 2,
      level: 9,
      totalScore: 1200,
      highScore: 1800,
      powerUps: { vip: 1, shuffle: 2, fill: 3 },
    })

    expect(loadProgress()).toEqual({
      version: 2,
      level: 9,
      totalScore: 1200,
      highScore: 1800,
      powerUps: { vip: 1, shuffle: 2, fill: 3 },
    })

    window.localStorage.setItem('bwh.cars-game.progress.v2', 'not json')
    expect(loadProgress()).toEqual({
      version: 2,
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
    version: 2,
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

function queueExactlyMirrorsSolvingBlocks(state: GameState, order: string[]): boolean {
  let passengerOffset = 0

  for (const carId of order) {
    const car = state.cars.find((candidate) => candidate.id === carId)
    if (!car) {
      return false
    }

    const passengerBlock = state.passengerQueue.slice(passengerOffset, passengerOffset + car.capacity)
    passengerOffset += car.capacity
    if (passengerBlock.length !== car.capacity || passengerBlock.some((passenger) => passenger.color !== car.color)) {
      return false
    }
  }

  return passengerOffset === state.passengerQueue.length
}

function stateAtDecisionStep(state: GameState, order: string[], targetStep: number): GameState {
  let current = drainVisibleBoardingForTest(state)

  for (let step = 0; step < targetStep; step += 1) {
    const carId = order[step]
    if (!carId) {
      throw new Error(`Missing solution step ${step}`)
    }

    let slot = firstOpenRegularSlotForTest(current)
    if (!slot || slot.index >= STARTING_REGULAR_SLOTS) {
      current = drainVisibleBoardingForTest(current)
      slot = firstOpenRegularSlotForTest(current)
    }

    if (!slot || slot.index >= STARTING_REGULAR_SLOTS) {
      throw new Error(`No open slot before solution step ${step}`)
    }

    current = moveCarToParking(current, carId, slot.id)
  }

  return current
}

function drainVisibleBoardingForTest(state: GameState): GameState {
  let current = state

  while (true) {
    const passenger = visibleQueuePassengers(current).find((candidate) => canBoardPassengerAtParkingGate(current, candidate.id))
    if (!passenger) {
      return current
    }

    const next = processBoardingAtParkingGate(current, passenger.id)
    if (next === current) {
      return current
    }

    current = next
  }
}

function firstOpenRegularSlotForTest(state: GameState): ParkingSlot | null {
  return state.parkingSlots.find((slot) => slot.kind === 'regular' && slot.unlocked && !slot.occupiedCarId) ?? null
}

function makeNoRescueState(overrides: Partial<GameState> = {}): GameState {
  return makeState({
    cars: [
      makeCar({ id: 'parked-red', color: 'red', status: 'parked', parkingSlotId: 'slot-1' }),
    ],
    parkingSlots: makeNoRescueParkingSlots(),
    passengerQueue: [{ id: 'p1', color: 'blue' }],
    powerUps: { fill: 0, shuffle: 0, vip: 0 },
    ...overrides,
  })
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

function backCellForTest(car: Pick<Car, 'direction' | 'length' | 'position'>): { x: number, y: number } {
  const step = directionStep(car.direction)
  const cells = getCarCells(car)
  const firstCell = cells[0]
  if (!firstCell) {
    return { ...car.position }
  }

  const back = cells.slice(1).reduce((currentBack, cell) => {
    const currentValue = currentBack.x * step.x + currentBack.y * step.y
    const nextValue = cell.x * step.x + cell.y * step.y

    return nextValue < currentValue ? cell : currentBack
  }, firstCell)

  return { ...back }
}

function gridCellKeyForTest(cell: { x: number, y: number }): string {
  return `${cell.x}:${cell.y}`
}

function sortCells(cells: { x: number, y: number }[]): { x: number, y: number }[] {
  return [...cells].sort((left, right) => left.x - right.x || left.y - right.y)
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

function makeNoRescueParkingSlots(): ParkingSlot[] {
  return makeParkingSlots().map((slot) => {
    if (slot.kind === 'vip') {
      return slot
    }

    return {
      ...slot,
      occupiedCarId: slot.id === 'slot-1' ? 'parked-red' : `occupied-${slot.id}`,
      unlocked: true,
    }
  })
}
