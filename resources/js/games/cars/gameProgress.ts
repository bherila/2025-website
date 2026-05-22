import {
  isRecord,
  parseArray,
  parseInteger,
  parseNumber,
  parseString,
  safeLocalStorage,
  safeProgressNumber,
} from '../_shared/progressParsers'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type Car,
  CAR_COLORS,
  type CarColor,
  type CarStatus,
  type Direction,
  DIRECTIONS,
  type FailedLevel,
  type FeederSide,
  GAME_PROGRESS_STORAGE_KEY,
  type GameState,
  type GridPosition,
  lengthForCapacity,
  type ParkingSlot,
  type ParkingSlotKind,
  type Passenger,
  type PowerUpInventory,
  type SavedGameProgress,
  type Tunnel,
} from './gameTypes'

export { safeProgressNumber }

export const LEVEL_SNAPSHOT_STORAGE_KEY = 'bwh.cars-game.snapshot.v2'

interface SavedLevelSnapshot {
  version: 2
  state: GameState
}

export function createInitialPowerUps(): PowerUpInventory {
  return {
    vip: 0,
    shuffle: 0,
    fill: 0,
  }
}

export function createInitialProgress(): SavedGameProgress {
  return {
    version: 2,
    level: 1,
    totalScore: 0,
    highScore: 0,
    powerUps: createInitialPowerUps(),
  }
}

export function loadProgress(storage: Storage | null = safeLocalStorage()): SavedGameProgress {
  if (!storage) {
    return createInitialProgress()
  }

  try {
    const raw = storage.getItem(GAME_PROGRESS_STORAGE_KEY)
    if (!raw) {
      return createInitialProgress()
    }

    const parsed = JSON.parse(raw) as Partial<SavedGameProgress>
    const parsedLevel = parsed.level
    if (parsed.version !== 2 || typeof parsedLevel !== 'number' || !Number.isInteger(parsedLevel) || parsedLevel < 1) {
      return createInitialProgress()
    }

    return {
      version: 2,
      level: parsedLevel,
      totalScore: safeProgressNumber(parsed.totalScore),
      highScore: safeProgressNumber(parsed.highScore),
      powerUps: sanitizePowerUps(parsed.powerUps),
    }
  } catch {
    return createInitialProgress()
  }
}

export function saveProgress(progress: SavedGameProgress, storage: Storage | null = safeLocalStorage()): void {
  if (!storage) {
    return
  }

  storage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify(progress))
}

export function saveLevelSnapshot(state: GameState, storage: Storage | null = safeLocalStorage()): void {
  if (!storage || state.completedLevel) {
    return
  }

  const snapshot: SavedLevelSnapshot = {
    version: 2,
    state: cloneSerializableState(state),
  }
  storage.setItem(LEVEL_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot))
}

export function loadLevelSnapshot(
  storage: Storage | null = safeLocalStorage(),
  progress: SavedGameProgress = loadProgress(storage),
): GameState | null {
  if (!storage) {
    return null
  }

  try {
    const raw = storage.getItem(LEVEL_SNAPSHOT_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed) || parsed.version !== 2) {
      return null
    }

    const state = parseGameState(parsed.state)
    if (!state || state.level !== progress.level) {
      return null
    }

    return state
  } catch {
    return null
  }
}

export function clearLevelSnapshot(storage: Storage | null = safeLocalStorage()): void {
  storage?.removeItem(LEVEL_SNAPSHOT_STORAGE_KEY)
}

export function progressFromState(state: GameState): SavedGameProgress {
  return {
    version: 2,
    level: state.completedLevel ? state.level + 1 : state.level,
    totalScore: state.totalScore,
    highScore: state.highScore,
    powerUps: { ...state.powerUps },
  }
}

export function sanitizePowerUps(powerUps: unknown): PowerUpInventory {
  const candidate = powerUps as Partial<PowerUpInventory> | undefined

  return {
    vip: Math.max(0, safeProgressNumber(candidate?.vip)),
    shuffle: Math.max(0, safeProgressNumber(candidate?.shuffle)),
    fill: Math.max(0, safeProgressNumber(candidate?.fill)),
  }
}

function cloneSerializableState(state: GameState): GameState {
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
    failedLevel: state.failedLevel ? { ...state.failedLevel } : null,
  }
}

function parseGameState(value: unknown): GameState | null {
  if (!isRecord(value) || value.version !== 2) {
    return null
  }

  const level = parseInteger(value.level, 1)
  const seed = parseInteger(value.seed)
  const boardWidth = parseInteger(value.boardWidth, 1)
  const boardHeight = parseInteger(value.boardHeight, 1)
  const cars = parseArray(value.cars, parseCar)
  const tunnels = parseArray(value.tunnels, parseTunnel)
  const passengerQueue = parseArray(value.passengerQueue, parsePassenger)
  const parkingSlots = parseArray(value.parkingSlots, parseParkingSlot)
  const levelScore = parseNumber(value.levelScore)
  const totalScore = parseNumber(value.totalScore)
  const highScore = parseNumber(value.highScore)
  const moves = parseNumber(value.moves)
  const maxRegularSlotsUsed = parseNumber(value.maxRegularSlotsUsed)
  const maxRegularSlotsUnlocked = parseNumber(value.maxRegularSlotsUnlocked)
  const failedLevel = parseFailedLevel(value.failedLevel)

  if (
    level === null
    || seed === null
    || boardWidth === null
    || boardHeight === null
    || cars === null
    || tunnels === null
    || passengerQueue === null
    || parkingSlots === null
    || levelScore === null
    || totalScore === null
    || highScore === null
    || moves === null
    || maxRegularSlotsUsed === null
    || maxRegularSlotsUnlocked === null
    || failedLevel === null
    || !isRecord(value.powerUps)
    || value.completedLevel !== null
  ) {
    return null
  }

  if (boardWidth !== BOARD_WIDTH || boardHeight !== BOARD_HEIGHT) {
    return null
  }

  if (cars.some((car) => car.length !== lengthForCapacity(car.capacity))) {
    return null
  }

  return {
    version: 2,
    level,
    seed,
    boardWidth,
    boardHeight,
    cars,
    tunnels,
    passengerQueue,
    parkingSlots,
    powerUps: sanitizePowerUps(value.powerUps),
    levelScore,
    totalScore,
    highScore,
    moves,
    maxRegularSlotsUsed,
    maxRegularSlotsUnlocked,
    lastMessage: typeof value.lastMessage === 'string' ? value.lastMessage : '',
    completedLevel: null,
    failedLevel: failedLevel ?? null,
  }
}

function parseFailedLevel(value: unknown): FailedLevel | undefined | null {
  if (value === undefined || value === null) {
    return undefined
  }

  if (!isRecord(value)) {
    return null
  }

  const level = parseInteger(value.level, 1)
  if (level === null || typeof value.reason !== 'string') {
    return null
  }

  return {
    level,
    reason: value.reason,
  }
}

function parseCar(value: unknown): Car | null {
  if (!isRecord(value)) {
    return null
  }

  const position = parseGridPosition(value.position)
  const color = parseCarColor(value.color)
  const direction = parseDirection(value.direction)
  const status = parseCarStatus(value.status)
  const capacity = parseInteger(value.capacity, 1)
  const length = parseInteger(value.length, 1)
  const sequence = parseInteger(value.sequence, 0)

  if (
    typeof value.id !== 'string'
    || color === null
    || direction === null
    || capacity === null
    || length === null
    || position === null
    || status === null
    || !isNullableString(value.parkingSlotId)
    || typeof value.boarded !== 'number'
    || !Number.isFinite(value.boarded)
    || !isNullableString(value.tunnelId)
    || sequence === null
  ) {
    return null
  }

  return {
    id: value.id,
    color,
    colorHidden: value.colorHidden === true,
    direction,
    capacity,
    length,
    position,
    status,
    parkingSlotId: value.parkingSlotId,
    boarded: value.boarded,
    tunnelId: value.tunnelId,
    sequence,
  }
}

function parseTunnel(value: unknown): Tunnel | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const position = parseGridPosition(value.position)
  const garagePosition = parseGridPosition(value.garagePosition)
  const direction = parseDirection(value.direction)
  const carIds = parseArray(value.carIds, parseString)
  const remaining = parseInteger(value.remaining, 0)

  if (
    position === null
    || garagePosition === null
    || direction === null
    || carIds === null
    || !isNullableString(value.visibleCarId)
    || remaining === null
  ) {
    return null
  }

  return {
    id: value.id,
    position,
    garagePosition,
    direction,
    carIds,
    visibleCarId: value.visibleCarId,
    remaining,
  }
}

function parsePassenger(value: unknown): Passenger | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const color = parseCarColor(value.color)
  const feederSide = parseFeederSide(value.feederSide)
  if (color === null || feederSide === null) {
    return null
  }

  return {
    id: value.id,
    color,
    ...(feederSide ? { feederSide } : {}),
  }
}

function parseParkingSlot(value: unknown): ParkingSlot | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const kind = parseParkingSlotKind(value.kind)
  const index = parseInteger(value.index)
  if (
    kind === null
    || typeof value.unlocked !== 'boolean'
    || !isNullableString(value.occupiedCarId)
    || index === null
  ) {
    return null
  }

  return {
    id: value.id,
    kind,
    unlocked: value.unlocked,
    occupiedCarId: value.occupiedCarId,
    index,
  }
}

function parseGridPosition(value: unknown): GridPosition | null {
  if (!isRecord(value)) {
    return null
  }

  const x = parseInteger(value.x)
  const y = parseInteger(value.y)
  if (x === null || y === null) {
    return null
  }

  return { x, y }
}

function parseCarColor(value: unknown): CarColor | null {
  return typeof value === 'string' && value in CAR_COLORS ? value as CarColor : null
}

function parseDirection(value: unknown): Direction | null {
  return typeof value === 'string' && DIRECTIONS.includes(value as Direction) ? value as Direction : null
}

function parseCarStatus(value: unknown): CarStatus | null {
  return value === 'field' || value === 'hidden' || value === 'parked' || value === 'departed' ? value : null
}

function parseFeederSide(value: unknown): FeederSide | undefined | null {
  if (value === undefined) {
    return undefined
  }

  return value === 'left' || value === 'right' ? value : null
}

function parseParkingSlotKind(value: unknown): ParkingSlotKind | null {
  return value === 'regular' || value === 'vip' ? value : null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}
