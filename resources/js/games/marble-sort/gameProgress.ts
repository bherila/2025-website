import {
  isRecord,
  parseArray,
  parseInteger,
  parseNumber,
  safeLocalStorage,
  safeProgressNumber,
} from '../_shared/progressParsers'
import {
  BOX_MARBLE_COUNT,
  type Chute,
  type CompletedLevel,
  type ConveyorMarble,
  type FallingMarble,
  type GameOver,
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

export { safeProgressNumber }

export const MARBLE_SORT_SNAPSHOT_STORAGE_KEY = 'bwh.marble-sort.snapshot.v2'

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
    const parsedLevel = parseInteger(parsed.level, 1)
    if (parsed.version !== 1 || parsedLevel === null) {
      return createInitialProgress()
    }

    return {
      version: 1,
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
    gameOver: state.gameOver ? { ...state.gameOver } : null,
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

  if (conveyor.some((marble) => marble.slotIndex >= conveyorCapacity)) {
    return null
  }

  const slotsSeen = new Set<number>()
  for (const marble of conveyor) {
    if (slotsSeen.has(marble.slotIndex)) {
      return null
    }
    slotsSeen.add(marble.slotIndex)
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
    baseConveyorCapacity: Math.max(BOX_MARBLE_COUNT, baseConveyorCapacity),
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
    gameOver: parseGameOver(value.gameOver),
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

  const side = value.side === 'right' || value.side === 'left' ? value.side : null
  if (row === null || row >= GRID_ROWS || queue === null || side === null) {
    return null
  }

  return {
    id: value.id,
    row,
    side,
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
  const slotIndex = parseInteger(value.slotIndex)
  if (!color || sequence === null || slotIndex === null || slotIndex < 0) {
    return null
  }

  return { id: value.id, color, sequence, slotIndex }
}

function parseFallingMarble(value: unknown): FallingMarble | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const color = parseMarbleColor(value.color)
  const sequence = parseInteger(value.sequence)
  const from = parseGridPosition(value.from)
  if (!color || sequence === null || !from) {
    return null
  }

  return { id: value.id, color, sequence, from }
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
  const awardedPowerUp = value.awardedPowerUp === 'shuffle' || value.awardedPowerUp === 'extraBelt' || value.awardedPowerUp === 'magnet'
    ? value.awardedPowerUp
    : null
  if (level === null || score === null || awardedPowerUp === null) {
    return null
  }

  return {
    awardedPowerUp,
    level,
    score,
  }
}

function parseGameOver(value: unknown): GameOver | null {
  if (!isRecord(value) || value.reason !== 'belt_full') {
    return null
  }

  return {
    reason: 'belt_full',
    message: typeof value.message === 'string'
      ? value.message
      : 'The conveyor is full. Reset the level and pop boxes in a different order.',
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

