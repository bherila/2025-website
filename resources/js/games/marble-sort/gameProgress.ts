import {
  BASE_CONVEYOR_CAPACITY,
  BOX_MARBLE_COUNT,
  type Chute,
  type CompletedLevel,
  type ConveyorMarble,
  type FallingMarble,
  type GameState,
  GRID_COLUMNS,
  GRID_ROWS,
  MARBLE_COLORS,
  MARBLE_SORT_PROGRESS_STORAGE_KEY,
  type MarbleBox,
  type PowerUpInventory,
  type SavedGameProgress,
  type SortingStack,
} from './gameTypes'

export const MARBLE_SORT_SNAPSHOT_STORAGE_KEY = 'bwh.marble-sort.snapshot.v1'

interface SavedLevelSnapshot {
  version: 1
  state: GameState
}

export function createInitialPowerUps(): PowerUpInventory {
  return {
    extraBelt: 0,
    magnet: 0,
    shuffle: 0,
  }
}

export function createInitialProgress(): SavedGameProgress {
  return {
    version: 1,
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
    const raw = storage.getItem(MARBLE_SORT_PROGRESS_STORAGE_KEY)
    if (!raw) {
      return createInitialProgress()
    }

    const parsed = JSON.parse(raw) as Partial<SavedGameProgress>
    if (parsed.version !== 1 || !isPositiveInteger(parsed.level)) {
      return createInitialProgress()
    }

    return {
      version: 1,
      level: parsed.level,
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

  storage.setItem(MARBLE_SORT_PROGRESS_STORAGE_KEY, JSON.stringify(progress))
}

export function saveLevelSnapshot(state: GameState, storage: Storage | null = safeLocalStorage()): void {
  if (!storage || state.completedLevel) {
    return
  }

  const snapshot: SavedLevelSnapshot = {
    version: 1,
    state: cloneSerializableState(state),
  }
  storage.setItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot))
}

export function loadLevelSnapshot(
  storage: Storage | null = safeLocalStorage(),
  progress: SavedGameProgress = loadProgress(storage),
): GameState | null {
  if (!storage) {
    return null
  }

  try {
    const raw = storage.getItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed) || parsed.version !== 1) {
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
  storage?.removeItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY)
}

export function progressFromState(state: GameState): SavedGameProgress {
  return {
    version: 1,
    level: state.completedLevel ? state.level + 1 : state.level,
    totalScore: state.totalScore,
    highScore: state.highScore,
    powerUps: { ...state.powerUps },
  }
}

export function sanitizePowerUps(powerUps: unknown): PowerUpInventory {
  const candidate = powerUps as Partial<PowerUpInventory> | undefined

  return {
    extraBelt: Math.max(0, safeProgressNumber(candidate?.extraBelt)),
    magnet: Math.max(0, safeProgressNumber(candidate?.magnet)),
    shuffle: Math.max(0, safeProgressNumber(candidate?.shuffle)),
  }
}

export function safeProgressNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

function cloneSerializableState(state: GameState): GameState {
  return {
    ...state,
    activeColors: [...state.activeColors],
    boxes: state.boxes.map((box) => ({
      ...box,
      position: { ...box.position },
    })),
    chutes: state.chutes.map((chute) => ({
      ...chute,
      queue: chute.queue.map((box) => ({ ...box })),
    })),
    conveyor: state.conveyor.map((marble) => ({ ...marble })),
    fallingMarbles: state.fallingMarbles.map((marble) => ({
      ...marble,
      from: { ...marble.from },
    })),
    sortingStacks: state.sortingStacks.map((stack) => ({
      ...stack,
      blocks: stack.blocks.map((block) => ({ ...block })),
    })),
    powerUps: { ...state.powerUps },
    completedLevel: state.completedLevel ? { ...state.completedLevel } : null,
  }
}

function parseGameState(value: unknown): GameState | null {
  if (!isRecord(value) || value.version !== 1) {
    return null
  }

  const level = parseInteger(value.level, 1)
  const seed = parseInteger(value.seed)
  const boxes = parseArray(value.boxes, parseMarbleBox)
  const chutes = parseArray(value.chutes, parseChute)
  const conveyor = parseArray(value.conveyor, parseConveyorMarble)
  const fallingMarbles = parseArray(value.fallingMarbles, parseFallingMarble)
  const sortingStacks = parseArray(value.sortingStacks, parseSortingStack)
  const activeColors = parseArray(value.activeColors, parseMarbleColor)
  const conveyorCapacity = parseInteger(value.conveyorCapacity, BOX_MARBLE_COUNT)
  const baseConveyorCapacity = parseInteger(value.baseConveyorCapacity, BOX_MARBLE_COUNT)
  const levelScore = parseNumber(value.levelScore)
  const totalScore = parseNumber(value.totalScore)
  const highScore = parseNumber(value.highScore)
  const moves = parseNumber(value.moves)
  const powerUpsUsed = parseNumber(value.powerUpsUsed)
  const clearedBlocks = parseNumber(value.clearedBlocks)
  const nextBoxSequence = parseInteger(value.nextBoxSequence)
  const nextMarbleSequence = parseInteger(value.nextMarbleSequence)
  const conveyorTicks = parseNumber(value.conveyorTicks)

  if (
    level === null
    || seed === null
    || boxes === null
    || chutes === null
    || conveyor === null
    || fallingMarbles === null
    || sortingStacks === null
    || activeColors === null
    || conveyorCapacity === null
    || baseConveyorCapacity === null
    || levelScore === null
    || totalScore === null
    || highScore === null
    || moves === null
    || powerUpsUsed === null
    || clearedBlocks === null
    || nextBoxSequence === null
    || nextMarbleSequence === null
    || conveyorTicks === null
    || !isRecord(value.powerUps)
  ) {
    return null
  }

  if (boxes.some((box) => box.position.column < 0 || box.position.column >= GRID_COLUMNS || box.position.row < 0 || box.position.row >= GRID_ROWS)) {
    return null
  }

  return {
    version: 1,
    level,
    seed,
    boxes,
    chutes,
    conveyor,
    fallingMarbles,
    sortingStacks,
    activeColors,
    conveyorCapacity: Math.max(BOX_MARBLE_COUNT, conveyorCapacity),
    baseConveyorCapacity: Math.max(BASE_CONVEYOR_CAPACITY, baseConveyorCapacity),
    levelScore,
    totalScore,
    highScore,
    moves,
    powerUpsUsed,
    clearedBlocks,
    nextBoxSequence,
    nextMarbleSequence,
    conveyorTicks,
    powerUps: sanitizePowerUps(value.powerUps),
    lastMessage: typeof value.lastMessage === 'string' ? value.lastMessage : '',
    completedLevel: parseCompletedLevel(value.completedLevel),
  }
}

function parseMarbleBox(value: unknown): MarbleBox | null {
  if (!isRecord(value)) {
    return null
  }

  const color = parseMarbleColor(value.color)
  const position = parseGridPosition(value.position)
  if (!color || !position || typeof value.id !== 'string') {
    return null
  }

  return {
    id: value.id,
    color,
    hidden: value.hidden === true,
    position,
    source: value.source === 'chute' ? 'chute' : 'initial',
  }
}

function parseChute(value: unknown): Chute | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const row = parseInteger(value.row, 0)
  const queue = parseArray(value.queue, (item): Chute['queue'][number] | null => {
    if (!isRecord(item)) {
      return null
    }

    const color = parseMarbleColor(item.color)
    return color ? { color, hidden: item.hidden === true } : null
  })

  if (row === null || row >= GRID_ROWS || queue === null) {
    return null
  }

  return {
    id: value.id,
    row,
    side: value.side === 'right' ? 'right' : 'left',
    remaining: Math.max(0, parseInteger(value.remaining, 0) ?? 0),
    queue,
  }
}

function parseConveyorMarble(value: unknown): ConveyorMarble | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const color = parseMarbleColor(value.color)
  const sequence = parseInteger(value.sequence)
  if (!color || sequence === null) {
    return null
  }

  return { id: value.id, color, sequence }
}

function parseFallingMarble(value: unknown): FallingMarble | null {
  const marble = parseConveyorMarble(value)
  if (!marble || !isRecord(value)) {
    return null
  }

  const from = parseGridPosition(value.from)
  return from ? { ...marble, from } : null
}

function parseSortingStack(value: unknown): SortingStack | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const color = parseMarbleColor(value.color)
  const index = parseInteger(value.index)
  const blocks = parseArray(value.blocks, (item): SortingStack['blocks'][number] | null => {
    if (!isRecord(item) || typeof item.id !== 'string') {
      return null
    }

    const blockColor = parseMarbleColor(item.color)
    const slotsFilled = parseInteger(item.slotsFilled, 0)
    if (!blockColor || slotsFilled === null || slotsFilled > 3) {
      return null
    }

    return {
      id: item.id,
      color: blockColor,
      slotsFilled,
    }
  })

  if (!color || index === null || blocks === null) {
    return null
  }

  return {
    id: value.id,
    color,
    index,
    blocks,
  }
}

function parseCompletedLevel(value: unknown): CompletedLevel | null {
  if (!isRecord(value)) {
    return null
  }

  const level = parseInteger(value.level, 1)
  const score = parseNumber(value.score)
  if (level === null || score === null) {
    return null
  }

  return {
    awardedPowerUp: value.awardedPowerUp === 'shuffle' || value.awardedPowerUp === 'extraBelt' ? value.awardedPowerUp : 'magnet',
    level,
    score,
  }
}

function parseGridPosition(value: unknown): { column: number, row: number } | null {
  if (!isRecord(value)) {
    return null
  }

  const column = parseInteger(value.column, 0)
  const row = parseInteger(value.row, 0)
  if (column === null || row === null) {
    return null
  }

  return { column, row }
}

function parseMarbleColor(value: unknown): keyof typeof MARBLE_COLORS | null {
  return typeof value === 'string' && value in MARBLE_COLORS ? value as keyof typeof MARBLE_COLORS : null
}

function parseArray<T>(value: unknown, parser: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const parsed: T[] = []
  for (const item of value) {
    const parsedItem = parser(item)
    if (parsedItem === null) {
      return null
    }

    parsed.push(parsedItem)
  }

  return parsed
}

function parseInteger(value: unknown, min?: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null
  }

  if (min !== undefined && value < min) {
    return null
  }

  return value
}

function parseNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
