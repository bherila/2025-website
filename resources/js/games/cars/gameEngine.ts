import {
  createInitialProgress,
  loadProgress,
  safeProgressNumber,
  sanitizePowerUps,
} from './gameProgress'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CAPACITIES,
  type Car,
  CAR_COLORS,
  type CarColor,
  type CarStatus,
  type Direction,
  DIRECTIONS,
  type GameState,
  type GridPosition,
  MAX_LOOP_PASSENGERS,
  MIN_LOOP_PASSENGERS,
  type ParkingSlot,
  type Passenger,
  type PowerUpInventory,
  type PowerUpKind,
  type SavedGameProgress,
  STARTING_REGULAR_SLOTS,
  TOTAL_REGULAR_SLOTS,
  type Tunnel,
} from './gameTypes'

export {
  clearLevelSnapshot,
  createInitialPowerUps,
  createInitialProgress,
  LEVEL_SNAPSHOT_STORAGE_KEY,
  loadLevelSnapshot,
  loadProgress,
  progressFromState,
  saveLevelSnapshot,
  saveProgress,
} from './gameProgress'
export type {
  Car,
  CarColor,
  CarPattern,
  CarStatus,
  CompletedLevel,
  Direction,
  GameState,
  GridPosition,
  ParkingSlot,
  ParkingSlotKind,
  Passenger,
  PowerUpInventory,
  PowerUpKind,
  SavedGameProgress,
  Tunnel,
} from './gameTypes'
export {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CAPACITIES,
  CAR_COLORS,
  CAR_PATTERN_VALUES,
  CAR_PATTERNS,
  DIRECTIONS,
  GAME_PROGRESS_STORAGE_KEY,
  MAX_LOOP_PASSENGERS,
  MIN_LOOP_PASSENGERS,
  STARTING_REGULAR_SLOTS,
  TOTAL_REGULAR_SLOTS,
} from './gameTypes'

interface RandomGenerator {
  next: () => number
  int: (min: number, max: number) => number
  pick: <T>(items: readonly T[]) => T
}

interface PlacementSpec {
  id: string
  tunnelId: string | null
  garagePosition: GridPosition | null
  capacity: number
  length: number
  direction: Direction
  position: GridPosition
  sequence: number
  status: CarStatus
}

const CAR_COLOR_KEYS = Object.keys(CAR_COLORS) as CarColor[]

export function startGameFromProgress(progress: SavedGameProgress = loadProgress()): GameState {
  return generateLevel(progress.level, seedForLevel(progress.level), {
    totalScore: progress.totalScore,
    highScore: progress.highScore,
    powerUps: progress.powerUps,
  })
}

export function resetGame(): GameState {
  return startGameFromProgress(createInitialProgress())
}

export function restartLevel(state: GameState): GameState {
  return generateLevel(state.level, seedForLevel(state.level), {
    totalScore: state.totalScore,
    highScore: state.highScore,
    powerUps: state.powerUps,
  })
}

export function advanceToNextLevel(state: GameState): GameState {
  if (!state.completedLevel) {
    return state
  }

  const nextLevel = state.level + 1
  return generateLevel(nextLevel, seedForLevel(nextLevel), {
    totalScore: state.totalScore,
    highScore: state.highScore,
    powerUps: state.powerUps,
  })
}

export function generateLevel(
  level: number,
  seed = seedForLevel(level),
  carry: {
    totalScore?: number
    highScore?: number
    powerUps?: PowerUpInventory
  } = {},
): GameState {
  const rng = createRng(seed)
  const totalCars = Math.min(7 + Math.floor(level * 1.6), 30)
  const tunnelStacks = Math.min(Math.max(0, Math.floor((level - 1) / 2)), 6)
  const maxAttempts = 180

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const specs = createPlacementSpecs(totalCars, tunnelStacks, rng)
    if (!specs) {
      continue
    }

    const state = createStateFromSpecs(level, seed + attempt, specs, carry)
    const order = findSolvingOrder(state)
    if (!order || order.length !== state.cars.length) {
      continue
    }

    applySolvableColorsAndQueue(state, order, rng)
    state.lastMessage = `Level ${level} is ready. Clear the cars without opening extra spaces.`

    return state
  }

  const fallbackSpecs = createOpenLaneSpecs(totalCars, tunnelStacks, rng)
  const fallbackState = createStateFromSpecs(level, seed, fallbackSpecs, carry)
  const fallbackOrder = findSolvingOrder(fallbackState) ?? fallbackState.cars.map((car) => car.id)
  applySolvableColorsAndQueue(fallbackState, fallbackOrder, rng)
  fallbackState.lastMessage = `Level ${level} is ready.`

  return fallbackState
}

export function getCarCells(car: Pick<Car, 'direction' | 'length' | 'position'>): GridPosition[] {
  const cells: GridPosition[] = []

  for (let offset = 0; offset < car.length; offset += 1) {
    if (car.direction === 'left' || car.direction === 'right') {
      cells.push({ x: car.position.x + offset, y: car.position.y })
    } else {
      cells.push({ x: car.position.x, y: car.position.y + offset })
    }
  }

  return cells
}

export function canMoveCar(state: GameState, carId: string): boolean {
  const car = findCar(state, carId)
  if (!car || car.status !== 'field') {
    return false
  }

  const occupied = blockingCellKeys(state, car.id)

  return pathCellsToExit(car, state.boardWidth, state.boardHeight).every((cell) => !occupied.has(gridCellKey(cell)))
}

export function activeGarageCells(state: Pick<GameState, 'tunnels'>): GridPosition[] {
  return state.tunnels
    .filter((tunnel) => tunnel.remaining > 0)
    .map((tunnel) => ({ ...tunnel.garagePosition }))
}

export function moveCarToParking(state: GameState, carId: string, slotId: string | null = null): GameState {
  const next = cloneState(state)
  if (next.completedLevel) {
    return next
  }

  const car = findCar(next, carId)
  if (!car || car.status !== 'field') {
    next.lastMessage = 'That car is not available.'
    return next
  }

  if (!canMoveCar(next, carId)) {
    next.lastMessage = 'That car is blocked by another car.'
    return next
  }

  const slot = slotId
    ? next.parkingSlots.find((candidate) => candidate.id === slotId)
    : firstOpenRegularSlot(next)

  if (!slot || slot.kind !== 'regular' || !slot.unlocked || slot.occupiedCarId) {
    next.lastMessage = 'Open another parking space before moving that car.'
    return next
  }

  parkCar(next, car, slot)
  revealNextTunnelCar(next, car.tunnelId)

  return next
}

export function applyVipPowerUp(state: GameState, carId: string): GameState {
  const next = cloneState(state)
  if (next.completedLevel) {
    return next
  }

  const slot = next.parkingSlots.find((candidate) => candidate.kind === 'vip')
  const car = findCar(next, carId)
  if (next.powerUps.vip < 1) {
    next.lastMessage = 'No VIP power-up is available.'
    return next
  }

  if (!slot || slot.occupiedCarId) {
    next.lastMessage = 'The VIP slot is already occupied.'
    return next
  }

  if (!car || car.status !== 'field') {
    next.lastMessage = 'Choose a visible car for the VIP slot.'
    return next
  }

  next.powerUps.vip -= 1
  parkCar(next, car, slot)
  revealNextTunnelCar(next, car.tunnelId)

  return next
}

export function applyShufflePowerUp(state: GameState): GameState {
  const next = cloneState(state)
  if (next.completedLevel) {
    return next
  }

  if (next.powerUps.shuffle < 1) {
    next.lastMessage = 'No shuffle power-up is available.'
    return next
  }

  const parkedCars = next.cars
    .filter((car) => car.status === 'parked')
    .sort((left, right) => slotSortValue(next, left.parkingSlotId) - slotSortValue(next, right.parkingSlotId))
  const futureOrder = findSolvingOrder(next) ?? []
  const activeCars = [
    ...parkedCars,
    ...futureOrder
      .map((id) => findCar(next, id))
      .filter((car): car is Car => Boolean(car)),
  ]

  if (activeCars.length === 0 || next.passengerQueue.length === 0) {
    next.lastMessage = 'There is nothing useful to shuffle.'
    return next
  }

  let passengerOffset = 0
  for (const car of activeCars) {
    const passenger = next.passengerQueue[passengerOffset] ?? next.passengerQueue[next.passengerQueue.length - 1]
    if (passenger) {
      car.color = passenger.color
    }
    passengerOffset += Math.max(1, car.capacity - car.boarded)
  }

  next.powerUps.shuffle -= 1
  next.lastMessage = 'Car colors were shuffled into a playable order.'

  return next
}

export function applyFillPowerUp(state: GameState): GameState {
  const next = cloneState(state)
  if (next.completedLevel) {
    return next
  }

  if (next.powerUps.fill < 1) {
    next.lastMessage = 'No fill power-up is available.'
    return next
  }

  const parkedCars = next.cars
    .filter((car) => car.status === 'parked')
    .sort((left, right) => slotSortValue(next, left.parkingSlotId) - slotSortValue(next, right.parkingSlotId))

  if (parkedCars.length === 0) {
    next.lastMessage = 'Park a car before using Fill.'
    return next
  }

  next.powerUps.fill -= 1
  for (const car of parkedCars) {
    const needed = car.capacity - car.boarded
    const boarded = Math.min(needed, next.passengerQueue.length)
    if (boarded > 0) {
      next.passengerQueue.splice(0, boarded)
      car.boarded += boarded
    }

    if (car.boarded >= car.capacity) {
      departParkedCar(next, car)
    }
  }

  next.lastMessage = 'Fill loaded every parked car it could.'
  completeLevelIfNeeded(next)

  return next
}

export function processBoardingAtParkingGate(state: GameState, passengerId: string | null = null): GameState {
  if (state.completedLevel) {
    return state
  }

  const next = cloneState(state)
  const boarded = boardPassengerAtParkingGate(next, passengerId)
  if (!boarded) {
    return state
  }

  completeLevelIfNeeded(next)

  return next
}

export function canBoardPassengerAtParkingGate(
  state: GameState,
  passengerId: string,
  unavailableCarIds: ReadonlySet<string> = new Set(),
): boolean {
  if (state.completedLevel) {
    return false
  }

  const passenger = state.passengerQueue.find((candidate) => candidate.id === passengerId)
  if (!passenger) {
    return false
  }

  return Boolean(findBoardingCarForPassenger(state, passenger, unavailableCarIds))
}

export function openParkingSlot(state: GameState): GameState {
  const next = cloneState(state)
  const slot = next.parkingSlots.find((candidate) => candidate.kind === 'regular' && !candidate.unlocked)
  if (!slot) {
    next.lastMessage = 'All parking spaces are already open.'
    return next
  }

  slot.unlocked = true
  next.maxRegularSlotsUnlocked = Math.max(next.maxRegularSlotsUnlocked, unlockedRegularSlots(next))
  next.levelScore = calculateLevelScore(next)
  next.lastMessage = 'Opened another parking space. This lowers the level score.'

  return next
}

export function findSolvingOrder(state: GameState): string[] | null {
  const statuses = new Map<string, CarStatus>()
  for (const car of state.cars) {
    statuses.set(car.id, car.status)
  }

  const order: string[] = []
  while (true) {
    const remaining = state.cars.filter((car) => {
      const status = statuses.get(car.id)

      return status !== 'departed' && status !== 'parked'
    })
    if (remaining.length === 0) {
      return order
    }

    const movable = state.cars
      .filter((car) => statuses.get(car.id) === 'field')
      .filter((car) => canMoveCarInSnapshot(state, statuses, car.id))
      .sort((left, right) => left.sequence - right.sequence)

    if (movable.length === 0) {
      return null
    }

    const car = movable[0]
    if (!car) {
      return null
    }

    statuses.set(car.id, 'departed')
    order.push(car.id)
    revealNextTunnelCarInSnapshot(state, statuses, car.tunnelId)
  }
}

export function solverCompletesLevel(state: GameState): boolean {
  const order = findSolvingOrder(state)

  const unsolvedCars = state.cars.filter((car) => car.status !== 'departed' && car.status !== 'parked')

  return Boolean(order && order.length === unsolvedCars.length)
}

export function calculateLevelScore(state: GameState): number {
  const openedPenalty = Math.max(0, state.maxRegularSlotsUnlocked - STARTING_REGULAR_SLOTS) * 175
  const usedPenalty = Math.max(0, state.maxRegularSlotsUsed - 1) * 95
  const movePenalty = Math.max(0, state.moves - state.cars.length) * 12
  const baseScore = 1000 + state.level * 110

  return Math.max(100, baseScore - openedPenalty - usedPenalty - movePenalty)
}

export function loopPassengerCapacity(state: Pick<GameState, 'level' | 'passengerQueue'>): number {
  const levelCapacity = MIN_LOOP_PASSENGERS + Math.floor((state.level - 1) / 3) * 2
  const cappedCapacity = Math.min(MAX_LOOP_PASSENGERS, levelCapacity)

  return Math.min(state.passengerQueue.length, Math.max(MIN_LOOP_PASSENGERS, cappedCapacity))
}

export function visibleQueuePassengers(state: GameState, maxVisible = loopPassengerCapacity(state)): Passenger[] {
  return state.passengerQueue.slice(0, maxVisible)
}

export function feederQueuePassengers(state: GameState, maxVisible = 40): Passenger[] {
  return state.passengerQueue.slice(loopPassengerCapacity(state), loopPassengerCapacity(state) + maxVisible)
}

function createPlacementSpecs(totalCars: number, tunnelStacks: number, rng: RandomGenerator): PlacementSpec[] | null {
  const specs: PlacementSpec[] = []
  const occupied = new Set<string>()
  let sequence = 0
  let carsRemaining = totalCars

  for (let tunnelIndex = 0; tunnelIndex < tunnelStacks && carsRemaining >= 3; tunnelIndex += 1) {
    const stackSize = Math.min(rng.int(2, 3), carsRemaining)
    const capacity = rng.pick(CAPACITIES)
    const length = lengthForCapacity(capacity)
    const direction = rng.pick(DIRECTIONS)
    const placement = findFreeGaragePlacement(length, direction, occupied, rng)
    if (!placement) {
      return null
    }

    reserveCells(occupied, garagePlacementCells(length, direction, placement))

    const tunnelId = `tunnel-${tunnelIndex + 1}`
    for (let stackIndex = 0; stackIndex < stackSize; stackIndex += 1) {
      specs.push({
        id: `car-${sequence + 1}`,
        tunnelId,
        garagePosition: { ...placement.garagePosition },
        capacity,
        length,
        direction,
        position: { ...placement.position },
        sequence,
        status: stackIndex === 0 ? 'field' : 'hidden',
      })
      sequence += 1
      carsRemaining -= 1
    }
  }

  while (carsRemaining > 0) {
    const capacity = rng.pick(CAPACITIES)
    const length = lengthForCapacity(capacity)
    const direction = rng.pick(DIRECTIONS)
    const position = findFreePlacement(length, direction, occupied, rng)
    if (!position) {
      return null
    }

    reserveCells(occupied, getCarCells({ direction, length, position }))

    specs.push({
      id: `car-${sequence + 1}`,
      tunnelId: null,
      garagePosition: null,
      capacity,
      length,
      direction,
      position,
      sequence,
      status: 'field',
    })
    sequence += 1
    carsRemaining -= 1
  }

  return specs
}

function createOpenLaneSpecs(totalCars: number, tunnelStacks: number, rng: RandomGenerator): PlacementSpec[] {
  const specs: PlacementSpec[] = []
  const occupied = new Set<string>()
  let sequence = 0
  let row = 0
  let column = 0
  let carsRemaining = totalCars

  for (let tunnelIndex = 0; tunnelIndex < tunnelStacks && carsRemaining >= 2; tunnelIndex += 1) {
    const capacity = 2
    const direction: Direction = 'right'
    const length = lengthForCapacity(capacity)
    const placement = findFirstFreeGaragePlacement(length, direction, occupied) ?? {
      position: { x: 1, y: row },
      garagePosition: { x: 0, y: row },
    }
    const tunnelId = `tunnel-${tunnelIndex + 1}`

    reserveCells(occupied, garagePlacementCells(length, direction, placement))

    for (let stackIndex = 0; stackIndex < 2; stackIndex += 1) {
      specs.push({
        id: `car-${sequence + 1}`,
        tunnelId,
        garagePosition: { ...placement.garagePosition },
        capacity,
        length,
        direction,
        position: { ...placement.position },
        sequence,
        status: stackIndex === 0 ? 'field' : 'hidden',
      })
      sequence += 1
      carsRemaining -= 1
    }

    row = (row + 2) % BOARD_HEIGHT
  }

  while (carsRemaining > 0) {
    const capacity = rng.pick(CAPACITIES)
    const direction: Direction = column % 2 === 0 ? 'right' : 'left'
    const length = lengthForCapacity(capacity)
    const position = findFirstFreePlacement(length, direction, occupied) ?? {
      x: direction === 'right' ? 0 : Math.max(0, BOARD_WIDTH - length),
      y: row,
    }
    reserveCells(occupied, getCarCells({ direction, length, position }))

    specs.push({
      id: `car-${sequence + 1}`,
      tunnelId: null,
      garagePosition: null,
      capacity,
      length,
      direction,
      position,
      sequence,
      status: 'field',
    })
    sequence += 1
    carsRemaining -= 1
    column += 1
    if (column >= 2) {
      column = 0
      row = (row + 1) % BOARD_HEIGHT
    }
  }

  return specs
}

function createStateFromSpecs(
  level: number,
  seed: number,
  specs: PlacementSpec[],
  carry: {
    totalScore?: number
    highScore?: number
    powerUps?: PowerUpInventory
  },
): GameState {
  const cars: Car[] = specs.map((spec) => ({
    id: spec.id,
    color: 'red',
    direction: spec.direction,
    capacity: spec.capacity,
    length: spec.length,
    position: { ...spec.position },
    status: spec.status,
    parkingSlotId: null,
    boarded: 0,
    tunnelId: spec.tunnelId,
    sequence: spec.sequence,
  }))

  const tunnelIds = [...new Set(specs.map((spec) => spec.tunnelId).filter((id): id is string => Boolean(id)))]
  const tunnels: Tunnel[] = tunnelIds.map((id, index) => {
    const tunnelCars = specs.filter((spec) => spec.tunnelId === id).sort((left, right) => left.sequence - right.sequence)
    const first = tunnelCars[0]

    return {
      id,
      position: first ? { ...first.position } : { x: index, y: 0 },
      garagePosition: first?.garagePosition ? { ...first.garagePosition } : { x: index, y: 0 },
      direction: first?.direction ?? 'right',
      carIds: tunnelCars.map((car) => car.id),
      visibleCarId: first?.id ?? null,
      remaining: Math.max(0, tunnelCars.length - 1),
    }
  })

  const state: GameState = {
    version: 1,
    level,
    seed,
    boardWidth: BOARD_WIDTH,
    boardHeight: BOARD_HEIGHT,
    cars,
    tunnels,
    passengerQueue: [],
    parkingSlots: createParkingSlots(),
    powerUps: sanitizePowerUps(carry.powerUps),
    levelScore: 0,
    totalScore: safeProgressNumber(carry.totalScore),
    highScore: safeProgressNumber(carry.highScore),
    moves: 0,
    maxRegularSlotsUsed: 0,
    maxRegularSlotsUnlocked: STARTING_REGULAR_SLOTS,
    lastMessage: '',
    completedLevel: null,
  }
  state.levelScore = calculateLevelScore(state)

  return state
}

function applySolvableColorsAndQueue(state: GameState, order: string[], rng: RandomGenerator): void {
  const passengers: Passenger[] = []

  for (const carId of order) {
    const car = findCar(state, carId)
    if (!car) {
      continue
    }

    car.color = rng.pick(CAR_COLOR_KEYS)
    for (let seat = 0; seat < car.capacity; seat += 1) {
      passengers.push({
        id: `passenger-${passengers.length + 1}`,
        color: car.color,
        feederSide: 'left',
      })
    }
  }

  assignFeederSides(state.level, passengers)
  state.passengerQueue = passengers
}

function assignFeederSides(level: number, passengers: Passenger[]): void {
  const levelCapacity = MIN_LOOP_PASSENGERS + Math.floor((level - 1) / 3) * 2
  const cappedCapacity = Math.min(MAX_LOOP_PASSENGERS, levelCapacity)
  const loopCapacity = Math.min(passengers.length, Math.max(MIN_LOOP_PASSENGERS, cappedCapacity))
  const feederCount = Math.max(0, passengers.length - loopCapacity)
  const leftReserve = Math.ceil(feederCount / 2)
  for (let index = loopCapacity; index < passengers.length; index += 1) {
    const passenger = passengers[index]
    if (!passenger) {
      continue
    }
    const offsetIntoFeeder = index - loopCapacity
    passenger.feederSide = offsetIntoFeeder < leftReserve ? 'left' : 'right'
  }
}

function parkCar(state: GameState, car: Car, slot: ParkingSlot): void {
  car.status = 'parked'
  car.parkingSlotId = slot.id
  slot.occupiedCarId = car.id
  state.moves += 1

  const occupiedRegularSlots = state.parkingSlots.filter(
    (candidate) => candidate.kind === 'regular' && candidate.occupiedCarId,
  ).length
  state.maxRegularSlotsUsed = Math.max(state.maxRegularSlotsUsed, occupiedRegularSlots)
  state.levelScore = calculateLevelScore(state)
  state.lastMessage = `${CAR_COLORS[car.color].label} car parked.`
}

function boardPassengerAtParkingGate(state: GameState, passengerId: string | null): boolean {
  const passengerIndex = passengerId
    ? state.passengerQueue.findIndex((candidate) => candidate.id === passengerId)
    : 0
  const passenger = state.passengerQueue[passengerIndex]
  if (!passenger) {
    return false
  }

  const car = findBoardingCarForPassenger(state, passenger)
  if (!car) {
    return false
  }

  state.passengerQueue.splice(passengerIndex, 1)
  car.boarded += 1
  state.lastMessage = `${CAR_COLORS[passenger.color].label} passenger boarded.`

  if (car.boarded >= car.capacity) {
    departParkedCar(state, car)
  }

  return true
}

function findBoardingCarForPassenger(
  state: GameState,
  passenger: Passenger,
  unavailableCarIds: ReadonlySet<string> = new Set(),
): Car | null {
  return state.cars
    .filter((candidate) => candidate.status === 'parked' && candidate.boarded < candidate.capacity)
    .filter((candidate) => !unavailableCarIds.has(candidate.id))
    .sort((left, right) => slotSortValue(state, left.parkingSlotId) - slotSortValue(state, right.parkingSlotId))
    .find((candidate) => candidate.color === passenger.color) ?? null
}

function departParkedCar(state: GameState, car: Car): void {
  const slot = state.parkingSlots.find((candidate) => candidate.id === car.parkingSlotId)
  if (slot) {
    slot.occupiedCarId = null
  }

  car.status = 'departed'
  car.parkingSlotId = null
  state.lastMessage = `${CAR_COLORS[car.color].label} car filled and left.`
}

function completeLevelIfNeeded(state: GameState): void {
  const allCarsDeparted = state.cars.every((car) => car.status === 'departed')
  if (!allCarsDeparted || state.passengerQueue.length > 0 || state.completedLevel) {
    return
  }

  const score = calculateLevelScore(state)
  const awardedPowerUp = awardPowerUp(state)
  state.powerUps[awardedPowerUp] += 1
  state.levelScore = score
  state.totalScore += score
  state.highScore = Math.max(state.highScore, state.totalScore)
  state.completedLevel = {
    level: state.level,
    score,
    awardedPowerUp,
  }
  state.lastMessage = `Level ${state.level} complete. Earned ${labelForPowerUp(awardedPowerUp)}.`
}

function revealNextTunnelCar(state: GameState, tunnelId: string | null): void {
  if (!tunnelId) {
    return
  }

  const tunnel = state.tunnels.find((candidate) => candidate.id === tunnelId)
  if (!tunnel) {
    return
  }

  const nextCar = tunnel.carIds
    .map((id) => findCar(state, id))
    .find((car): car is Car => car !== null && car.status === 'hidden')

  if (!nextCar) {
    tunnel.visibleCarId = null
    tunnel.remaining = 0
    return
  }

  nextCar.status = 'field'
  nextCar.position = { ...tunnel.position }
  tunnel.visibleCarId = nextCar.id
  tunnel.remaining = tunnel.carIds
    .map((id) => findCar(state, id))
    .filter((car): car is Car => car !== null && car.status === 'hidden').length
}

function revealNextTunnelCarInSnapshot(
  state: GameState,
  statuses: Map<string, CarStatus>,
  tunnelId: string | null,
): void {
  if (!tunnelId) {
    return
  }

  const tunnel = state.tunnels.find((candidate) => candidate.id === tunnelId)
  if (!tunnel) {
    return
  }

  const nextCarId = tunnel.carIds.find((id) => statuses.get(id) === 'hidden')
  if (nextCarId) {
    statuses.set(nextCarId, 'field')
  }
}

function canMoveCarInSnapshot(state: GameState, statuses: Map<string, CarStatus>, carId: string): boolean {
  const car = findCar(state, carId)
  if (!car || statuses.get(car.id) !== 'field') {
    return false
  }

  const occupied = blockingCellsInSnapshot(state, statuses, car.id)

  return pathCellsToExit(car, state.boardWidth, state.boardHeight).every((cell) => !occupied.has(gridCellKey(cell)))
}

function pathCellsToExit(car: Car, boardWidth: number, boardHeight: number): GridPosition[] {
  const cells: GridPosition[] = []

  if (car.direction === 'right') {
    const start = car.position.x + car.length
    for (let x = start; x < boardWidth; x += 1) {
      cells.push({ x, y: car.position.y })
    }
  }

  if (car.direction === 'left') {
    for (let x = car.position.x - 1; x >= 0; x -= 1) {
      cells.push({ x, y: car.position.y })
    }
  }

  if (car.direction === 'down') {
    const start = car.position.y + car.length
    for (let y = start; y < boardHeight; y += 1) {
      cells.push({ x: car.position.x, y })
    }
  }

  if (car.direction === 'up') {
    for (let y = car.position.y - 1; y >= 0; y -= 1) {
      cells.push({ x: car.position.x, y })
    }
  }

  return cells
}

function occupiedCells(cars: Car[]): Set<string> {
  const cells = new Set<string>()
  for (const car of cars) {
    for (const cell of getCarCells(car)) {
      cells.add(gridCellKey(cell))
    }
  }

  return cells
}

export function blockingCellKeys(state: GameState, excludedCarId: string | null = null): Set<string> {
  const cells = occupiedCells(
    state.cars.filter((candidate) => candidate.status === 'field' && candidate.id !== excludedCarId),
  )
  for (const cell of activeGarageCells(state)) {
    cells.add(gridCellKey(cell))
  }

  return cells
}

function blockingCellsInSnapshot(
  state: GameState,
  statuses: Map<string, CarStatus>,
  excludedCarId: string | null = null,
): Set<string> {
  const cells = occupiedCells(
    state.cars.filter((candidate) => statuses.get(candidate.id) === 'field' && candidate.id !== excludedCarId),
  )
  for (const cell of activeGarageCellsInSnapshot(state, statuses)) {
    cells.add(gridCellKey(cell))
  }

  return cells
}

function activeGarageCellsInSnapshot(state: GameState, statuses: Map<string, CarStatus>): GridPosition[] {
  return state.tunnels
    .filter((tunnel) => tunnel.carIds.some((id) => statuses.get(id) === 'hidden'))
    .map((tunnel) => ({ ...tunnel.garagePosition }))
}

function reserveCells(occupied: Set<string>, cells: GridPosition[]): void {
  for (const cell of cells) {
    occupied.add(gridCellKey(cell))
  }
}

function garagePlacementCells(
  length: number,
  direction: Direction,
  placement: { garagePosition: GridPosition, position: GridPosition },
): GridPosition[] {
  return [
    ...getCarCells({ direction, length, position: placement.position }),
    placement.garagePosition,
  ]
}

function findFreeGaragePlacement(
  length: number,
  direction: Direction,
  occupied: Set<string>,
  rng: RandomGenerator,
): { garagePosition: GridPosition, position: GridPosition } | null {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const position = randomGarageSpawnPosition(length, direction, rng)
    const garagePosition = garagePositionForCar({ direction, length, position })
    if (!garagePosition) {
      continue
    }

    const cells = [...getCarCells({ direction, length, position }), garagePosition]
    if (placementIsFree(cells, occupied)) {
      return { position, garagePosition }
    }
  }

  return null
}

function findFirstFreeGaragePlacement(
  length: number,
  direction: Direction,
  occupied: Set<string>,
): { garagePosition: GridPosition, position: GridPosition } | null {
  const horizontal = direction === 'left' || direction === 'right'
  const maxX = horizontal ? BOARD_WIDTH - length : BOARD_WIDTH - 1
  const maxY = horizontal ? BOARD_HEIGHT - 1 : BOARD_HEIGHT - length

  for (let y = 0; y <= maxY; y += 1) {
    for (let x = 0; x <= maxX; x += 1) {
      const position = { x, y }
      const garagePosition = garagePositionForCar({ direction, length, position })
      if (!garagePosition) {
        continue
      }

      const cells = garagePlacementCells(length, direction, { position, garagePosition })
      if (placementIsFree(cells, occupied)) {
        return { position, garagePosition }
      }
    }
  }

  return null
}

function randomGarageSpawnPosition(length: number, direction: Direction, rng: RandomGenerator): GridPosition {
  if (direction === 'right') {
    return { x: rng.int(1, BOARD_WIDTH - length), y: rng.int(0, BOARD_HEIGHT - 1) }
  }

  if (direction === 'left') {
    return { x: rng.int(0, BOARD_WIDTH - length - 1), y: rng.int(0, BOARD_HEIGHT - 1) }
  }

  if (direction === 'down') {
    return { x: rng.int(0, BOARD_WIDTH - 1), y: rng.int(1, BOARD_HEIGHT - length) }
  }

  return { x: rng.int(0, BOARD_WIDTH - 1), y: rng.int(0, BOARD_HEIGHT - length - 1) }
}

function garagePositionForCar(car: Pick<Car, 'direction' | 'length' | 'position'>): GridPosition | null {
  if (car.direction === 'right') {
    return inBounds({ x: car.position.x - 1, y: car.position.y })
  }

  if (car.direction === 'left') {
    return inBounds({ x: car.position.x + car.length, y: car.position.y })
  }

  if (car.direction === 'down') {
    return inBounds({ x: car.position.x, y: car.position.y - 1 })
  }

  return inBounds({ x: car.position.x, y: car.position.y + car.length })
}

function inBounds(position: GridPosition): GridPosition | null {
  if (position.x < 0 || position.x >= BOARD_WIDTH || position.y < 0 || position.y >= BOARD_HEIGHT) {
    return null
  }

  return position
}

function findFreePlacement(
  length: number,
  direction: Direction,
  occupied: Set<string>,
  rng: RandomGenerator,
): GridPosition | null {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const horizontal = direction === 'left' || direction === 'right'
    const position = {
      x: horizontal ? rng.int(0, BOARD_WIDTH - length) : rng.int(0, BOARD_WIDTH - 1),
      y: horizontal ? rng.int(0, BOARD_HEIGHT - 1) : rng.int(0, BOARD_HEIGHT - length),
    }

    const cells = getCarCells({ direction, length, position })
    if (placementIsFree(cells, occupied)) {
      return position
    }
  }

  return null
}

function findFirstFreePlacement(length: number, direction: Direction, occupied: Set<string>): GridPosition | null {
  const horizontal = direction === 'left' || direction === 'right'
  const maxX = horizontal ? BOARD_WIDTH - length : BOARD_WIDTH - 1
  const maxY = horizontal ? BOARD_HEIGHT - 1 : BOARD_HEIGHT - length

  for (let y = 0; y <= maxY; y += 1) {
    for (let x = 0; x <= maxX; x += 1) {
      const position = { x, y }
      const cells = getCarCells({ direction, length, position })
      if (placementIsFree(cells, occupied)) {
        return position
      }
    }
  }

  return null
}

function placementIsFree(cells: GridPosition[], occupied: Set<string>): boolean {
  return cells.every((cell) => !occupied.has(gridCellKey(cell)))
}

function firstOpenRegularSlot(state: GameState): ParkingSlot | null {
  return state.parkingSlots.find(
    (slot) => slot.kind === 'regular' && slot.unlocked && !slot.occupiedCarId,
  ) ?? null
}

function createParkingSlots(): ParkingSlot[] {
  const slots: ParkingSlot[] = [
    {
      id: 'vip',
      kind: 'vip',
      unlocked: true,
      occupiedCarId: null,
      index: -1,
    },
  ]

  for (let index = 0; index < TOTAL_REGULAR_SLOTS; index += 1) {
    slots.push({
      id: `slot-${index + 1}`,
      kind: 'regular',
      unlocked: index < STARTING_REGULAR_SLOTS,
      occupiedCarId: null,
      index,
    })
  }

  return slots
}

function unlockedRegularSlots(state: GameState): number {
  return state.parkingSlots.filter((slot) => slot.kind === 'regular' && slot.unlocked).length
}

function slotSortValue(state: GameState, slotId: string | null): number {
  if (!slotId) {
    return Number.MAX_SAFE_INTEGER
  }

  const slot = state.parkingSlots.find((candidate) => candidate.id === slotId)
  if (!slot) {
    return Number.MAX_SAFE_INTEGER
  }

  return slot.kind === 'vip' ? -1 : slot.index
}

function findCar(state: GameState, id: string): Car | null {
  return state.cars.find((car) => car.id === id) ?? null
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    cars: state.cars.map((car) => ({
      ...car,
      position: { ...car.position },
    })),
    tunnels: state.tunnels.map((tunnel) => ({
      ...tunnel,
      position: { ...tunnel.position },
      garagePosition: { ...tunnel.garagePosition },
      carIds: [...tunnel.carIds],
    })),
    passengerQueue: state.passengerQueue.map((passenger) => ({ ...passenger })),
    parkingSlots: state.parkingSlots.map((slot) => ({ ...slot })),
    powerUps: { ...state.powerUps },
    completedLevel: state.completedLevel ? { ...state.completedLevel } : null,
  }
}

function lengthForCapacity(capacity: number): number {
  if (capacity <= 2) {
    return 2
  }

  if (capacity <= 4) {
    return 3
  }

  return 4
}

function awardPowerUp(state: GameState): PowerUpKind {
  const rng = createRng(state.seed + state.level * 104_729 + state.moves * 37)

  return rng.pick(['vip', 'shuffle', 'fill'] as const)
}

export function labelForPowerUp(powerUp: PowerUpKind): string {
  if (powerUp === 'vip') {
    return 'VIP'
  }

  if (powerUp === 'shuffle') {
    return 'Shuffle'
  }

  return 'Fill'
}

function seedForLevel(level: number): number {
  return 53_111 + level * 9_973
}

function createRng(seed: number): RandomGenerator {
  let value = seed >>> 0
  const next = (): number => {
    value += 0x6D2B79F5
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)

    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296
  }

  return {
    next,
    int(min: number, max: number): number {
      return Math.floor(next() * (max - min + 1)) + min
    },
    pick<T>(items: readonly T[]): T {
      const item = items[Math.floor(next() * items.length)]
      if (item === undefined) {
        throw new Error('Cannot pick from an empty list.')
      }

      return item
    },
  }
}

export function gridCellKey(cell: GridPosition): string {
  return `${cell.x}:${cell.y}`
}
