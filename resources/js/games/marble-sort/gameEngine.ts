import {
  createInitialProgress,
  loadProgress,
  safeProgressNumber,
  sanitizePowerUps,
} from './gameProgress'
import {
  BASE_CONVEYOR_CAPACITY,
  BOX_MARBLE_COUNT,
  type Chute,
  type CompletedLevel,
  type ConveyorMarble,
  type GameOver,
  type GameState,
  GRID_COLUMNS,
  GRID_ROWS,
  MARBLE_COLORS,
  type MarbleBox,
  type MarbleColor,
  type PowerUpInventory,
  type PowerUpKind,
  type SavedGameProgress,
  SORTING_BLOCK_CAPACITY,
  type SortingBlock,
  type SortingStack,
} from './gameTypes'
import {
  conveyorPhaseForTick,
  conveyorSlotCountFor,
  passingSortingStackIndexForSlot,
} from './scene/conveyorProgress'

export {
  clearLevelSnapshot,
  createInitialPowerUps,
  createInitialProgress,
  loadLevelSnapshot,
  loadProgress,
  MARBLE_SORT_SNAPSHOT_STORAGE_KEY,
  progressFromState,
  safeProgressNumber,
  sanitizePowerUps,
  saveLevelSnapshot,
  saveProgress,
} from './gameProgress'
export type {
  Chute,
  ChuteSide,
  CompletedLevel,
  ConveyorMarble,
  FallingMarble,
  GameOver,
  GameState,
  GridPosition,
  MarbleBox,
  MarbleColor,
  MarblePattern,
  PowerUpInventory,
  PowerUpKind,
  SavedGameProgress,
  SortingBlock,
  SortingStack,
} from './gameTypes'
export {
  BASE_CONVEYOR_CAPACITY,
  BOX_MARBLE_COUNT,
  GRID_COLUMNS,
  GRID_ROWS,
  MARBLE_COLORS,
  MARBLE_PATTERN_VALUES,
  MARBLE_PATTERNS,
  MARBLE_SORT_PROGRESS_STORAGE_KEY,
  SORTING_BLOCK_CAPACITY,
} from './gameTypes'

interface RandomGenerator {
  next: () => number
  int: (min: number, max: number) => number
  pick: <T>(items: readonly T[]) => T
}

interface ChutePlan {
  row: number
  side: Chute['side']
  count: number
}

const MARBLE_COLOR_KEYS = Object.keys(MARBLE_COLORS) as MarbleColor[]
const POWER_UPS: PowerUpKind[] = ['magnet', 'shuffle', 'extraBelt']
const MARBLES_SETTLED_PER_TICK = 1

export function startGameFromProgress(progress: SavedGameProgress = loadProgress()): GameState {
  return generateLevel(progress.level, seedForLevel(progress.level), {
    highScore: progress.highScore,
    powerUps: progress.powerUps,
    totalScore: progress.totalScore,
  })
}

export function resetGame(): GameState {
  return startGameFromProgress(createInitialProgress())
}

export function restartLevel(state: GameState): GameState {
  return generateLevel(state.level, seedForLevel(state.level), {
    highScore: state.highScore,
    powerUps: state.powerUps,
    totalScore: state.totalScore,
  })
}

export function advanceToNextLevel(state: GameState): GameState {
  if (!state.completedLevel) {
    return state
  }

  const nextLevel = state.level + 1

  return generateLevel(nextLevel, seedForLevel(nextLevel), {
    highScore: state.highScore,
    powerUps: state.powerUps,
    totalScore: state.totalScore,
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
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = createGeneratedLevel(level, seed + attempt, carry)
    if (solverCompletesLevel(state)) {
      return state
    }
  }

  return createFallbackLevel(level, seed, carry)
}

export function openBox(state: GameState, boxId: string): GameState {
  if (state.completedLevel || state.gameOver) {
    return state
  }

  const box = state.boxes.find((candidate) => candidate.id === boxId)
  if (!box) {
    return {
      ...state,
      lastMessage: 'That square is already clear.',
    }
  }

  const next = cloneState(state)
  next.boxes = next.boxes.filter((candidate) => candidate.id !== boxId)
  next.moves += 1
  next.levelScore = Math.max(0, next.levelScore - 5)

  for (let index = 0; index < BOX_MARBLE_COUNT; index += 1) {
    const sequence = next.nextMarbleSequence
    next.nextMarbleSequence += 1
    next.fallingMarbles.push({
      color: box.color,
      from: { ...box.position },
      id: `marble-${sequence}`,
      sequence,
    })
  }

  refillGridFromChutes(next, box)
  next.lastMessage = `${MARBLE_COLORS[box.color].label} box opened. ${BOX_MARBLE_COUNT} marbles are falling.`

  return checkBeltFull(next)
}

export function processConveyorTick(state: GameState): GameState {
  if (state.completedLevel || state.gameOver) {
    return state
  }

  if (state.fallingMarbles.length > 0) {
    const freeSlots = Math.max(0, state.conveyorCapacity - state.conveyor.length)
    if (freeSlots > 0) {
      return settleFallingMarbles(state, freeSlots)
    }
  }

  return advanceConveyor(state)
}

// Advance the conveyor only — does NOT auto-settle falling marbles. The scene
// drives settling via arriveFallingMarble() when each marble's physics reaches
// the basin exit, so the visual fall and the logical belt entry stay aligned.
export function processBeltTick(state: GameState): GameState {
  if (state.completedLevel || state.gameOver) {
    return state
  }

  return advanceConveyor(state)
}

export function arriveFallingMarble(state: GameState, marbleId: string): GameState {
  if (state.completedLevel || state.gameOver) {
    return state
  }

  const index = state.fallingMarbles.findIndex((candidate) => candidate.id === marbleId)
  if (index < 0) {
    return state
  }

  const freeSlots = state.conveyorCapacity - state.conveyor.length
  if (freeSlots < 1) {
    return state
  }

  const next = cloneState(state)
  const marble = next.fallingMarbles[index]
  if (!marble) {
    return state
  }
  next.fallingMarbles = [
    ...next.fallingMarbles.slice(0, index),
    ...next.fallingMarbles.slice(index + 1),
  ]
  const { from: _from, ...conveyorMarble } = marble
  next.conveyor = [...next.conveyor, conveyorMarble]
  next.conveyorTicks += 1

  return checkBeltFull(checkLevelComplete(next))
}

function settleFallingMarbles(state: GameState, freeSlots: number): GameState {
  const next = cloneState(state)
  const settledCount = Math.min(freeSlots, MARBLES_SETTLED_PER_TICK)
  const settled = next.fallingMarbles.slice(0, settledCount)
  const waiting = next.fallingMarbles.slice(settledCount)
  next.conveyor = [...next.conveyor, ...settled.map(({ from: _from, ...marble }) => marble)]
  next.fallingMarbles = waiting
  next.conveyorTicks += 1
  next.lastMessage = waiting.length > 0
    ? 'Some marbles are waiting for space on the conveyor.'
    : 'Marbles joined the conveyor.'

  return checkBeltFull(checkLevelComplete(next))
}

function advanceConveyor(state: GameState): GameState {
  if (state.conveyor.length < 1) {
    return checkLevelComplete(state)
  }

  const next = cloneState(state)
  const sortedColors: MarbleColor[] = []
  // Each slot's drop window is only 0.5/slotCount wide and the slot advances
  // 1/slotCount per tick, so any marble that passes a matching stack gets
  // exactly one tick of opportunity. Sort EVERY eligible marble this tick;
  // otherwise the second eligible marble misses its window and has to do a
  // full lap.
  let guard = next.conveyor.length
  while (guard > 0) {
    guard -= 1
    const passingMarble = findPassingSortableConveyorMarble(next)
    if (!passingMarble) {
      break
    }
    if (!fillMarbleIntoSortingBlock(next, passingMarble.marble, passingMarble.stackIndex)) {
      break
    }
    const marble = passingMarble.marble
    next.conveyor = next.conveyor.filter((candidate) => candidate.id !== marble.id)
    sortedColors.push(marble.color)
  }

  if (sortedColors.length === 1) {
    next.lastMessage = `${MARBLE_COLORS[sortedColors[0]!].label} marble sorted.`
  }
  else if (sortedColors.length > 1) {
    next.lastMessage = `${sortedColors.length.toLocaleString()} marbles sorted.`
  }
  else {
    next.lastMessage = 'Marbles are circling toward matching blocks.'
  }
  next.conveyorTicks += 1

  return checkBeltFull(checkLevelComplete(next))
}

export function drainConveyor(state: GameState, maxTicks = 5000): GameState {
  let next = state

  for (let tick = 0; tick < maxTicks; tick += 1) {
    if (next.completedLevel || next.gameOver || (next.fallingMarbles.length === 0 && next.conveyor.length === 0)) {
      return checkLevelComplete(next)
    }

    const before = signatureForDrain(next)
    next = processConveyorTick(next)
    if (signatureForDrain(next) === before && next.fallingMarbles.length === 0) {
      return next
    }
  }

  return next
}

export function applyMagnetPowerUp(state: GameState): GameState {
  if (state.completedLevel || state.gameOver || state.powerUps.magnet < 1) {
    return state
  }

  if (state.conveyor.length < 1) {
    return {
      ...state,
      lastMessage: 'No conveyor marbles to magnetize yet.',
    }
  }

  const next = cloneState(state)
  const remaining: ConveyorMarble[] = []
  let sorted = 0
  for (const marble of next.conveyor) {
    const stackIndex = leftmostOpenStackIndexForColor(next, marble.color)
    if (stackIndex !== undefined && fillMarbleIntoSortingBlock(next, marble, stackIndex)) {
      sorted += 1
    } else {
      remaining.push(marble)
    }
  }

  if (sorted < 1) {
    return {
      ...state,
      lastMessage: 'No matching sorting blocks are open yet.',
    }
  }

  next.conveyor = remaining
  next.powerUps.magnet -= 1
  next.powerUpsUsed += 1
  next.levelScore = Math.max(0, next.levelScore - 25)
  next.lastMessage = `Magnet sorted ${sorted.toLocaleString()} marbles.`

  return checkLevelComplete(next)
}

export function applyShufflePowerUp(state: GameState): GameState {
  if (state.completedLevel || state.gameOver || state.powerUps.shuffle < 1) {
    return state
  }

  const next = cloneState(state)
  const colors = [
    ...next.boxes.map((box) => box.color),
    ...next.chutes.flatMap((chute) => chute.queue.map((box) => box.color)),
  ]
  if (colors.length < 2) {
    return {
      ...state,
      lastMessage: 'No boxes are available to shuffle.',
    }
  }

  const offset = (next.seed + next.moves + next.powerUpsUsed + 1) % colors.length
  const shuffledColors = [...colors.slice(offset), ...colors.slice(0, offset)].reverse()
  let colorIndex = 0

  next.boxes = next.boxes.map((box) => {
    const color = shuffledColors[colorIndex] ?? box.color
    colorIndex += 1

    return { ...box, color }
  })
  next.chutes = next.chutes.map((chute) => ({
    ...chute,
    queue: chute.queue.map((box) => {
      const color = shuffledColors[colorIndex] ?? box.color
      colorIndex += 1

      return { ...box, color }
    }),
  }))
  next.powerUps.shuffle -= 1
  next.powerUpsUsed += 1
  next.levelScore = Math.max(0, next.levelScore - 25)
  next.lastMessage = 'The remaining boxes have been shuffled.'

  return next
}

export function applyExtraBeltPowerUp(state: GameState): GameState {
  if (state.completedLevel || state.gameOver || state.powerUps.extraBelt < 1) {
    return state
  }

  return {
    ...state,
    conveyorCapacity: state.conveyorCapacity + BOX_MARBLE_COUNT,
    levelScore: Math.max(0, state.levelScore - 25),
    lastMessage: 'Extra Belt added room for another box of marbles.',
    powerUps: {
      ...state.powerUps,
      extraBelt: state.powerUps.extraBelt - 1,
    },
    powerUpsUsed: state.powerUpsUsed + 1,
  }
}

export function solverCompletesLevel(state: GameState): boolean {
  let next = cloneState(state)

  for (let step = 0; step < 500; step += 1) {
    next = drainConveyor(next)
    if (next.completedLevel) {
      return true
    }

    if (next.gameOver) {
      return false
    }

    const openable = next.boxes.find((box) => hasOpenReceptacleForColor(next, box.color))
    if (!openable || availableConveyorSlots(next) < BOX_MARBLE_COUNT) {
      return false
    }

    next = openBox(next, openable.id)
  }

  return false
}

export function availableConveyorSlots(state: GameState): number {
  return Math.max(0, state.conveyorCapacity - state.conveyor.length - state.fallingMarbles.length)
}

export function isBoxDisplayedAsHidden(box: MarbleBox, boxes: readonly MarbleBox[]): boolean {
  if (!box.hidden) {
    return false
  }

  const occupied = new Set<string>()
  for (const candidate of boxes) {
    occupied.add(`${candidate.position.column},${candidate.position.row}`)
  }

  const neighbors: Array<[number, number]> = [
    [box.position.column, box.position.row - 1],
    [box.position.column, box.position.row + 1],
    [box.position.column - 1, box.position.row],
    [box.position.column + 1, box.position.row],
  ]

  for (const [column, row] of neighbors) {
    const inGrid = column >= 0 && column < GRID_COLUMNS && row >= 0 && row < GRID_ROWS
    if (inGrid && !occupied.has(`${column},${row}`)) {
      return false
    }
  }

  return true
}

export function remainingChuteBoxes(state: GameState): number {
  return state.chutes.reduce((total, chute) => total + chute.remaining, 0)
}

export function remainingSortingBlocks(state: GameState): number {
  return state.sortingStacks.reduce((total, stack) => total + stack.blocks.length, 0)
}

export function labelForPowerUp(powerUp: PowerUpKind): string {
  if (powerUp === 'extraBelt') {
    return 'Extra Belt'
  }

  return powerUp === 'magnet' ? 'Magnet' : 'Shuffle'
}

export function seedForLevel(level: number): number {
  return 91_337 + level * 7_919
}

function createGeneratedLevel(
  level: number,
  seed: number,
  carry: {
    totalScore?: number
    highScore?: number
    powerUps?: PowerUpInventory
  },
): GameState {
  const rng = createRng(seed)
  const activeColorCount = Math.min(3 + Math.floor((level - 1) / 3), 6)
  const activeColors = shuffle(MARBLE_COLOR_KEYS, rng).slice(0, activeColorCount)
  const chutePlans = createChutePlans(level, rng)
  const totalBoxes = GRID_COLUMNS * GRID_ROWS + chutePlans.reduce((total, chute) => total + chute.count, 0)
  const colorQueue = createBalancedColorQueue(activeColors, totalBoxes, rng)
  const hiddenChance = Math.min(0.08 + level * 0.018, 0.32)
  let nextBoxSequence = 1

  const boxes: MarbleBox[] = []
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      boxes.push({
        color: colorQueue.shift() ?? rng.pick(activeColors),
        hidden: rng.next() < hiddenChance,
        id: `box-${nextBoxSequence}`,
        position: { column, row },
        source: 'initial',
      })
      nextBoxSequence += 1
    }
  }

  const chutes: Chute[] = chutePlans.map((plan, index) => {
    const queue = Array.from({ length: plan.count }, () => ({
      color: colorQueue.shift() ?? rng.pick(activeColors),
      hidden: rng.next() < hiddenChance,
    }))

    return {
      id: `chute-${index + 1}`,
      queue,
      remaining: queue.length,
      row: plan.row,
      side: plan.side,
    }
  })
  const sortingStacks = createSortingStacks(activeColors, [...boxes, ...chuteBoxesAsGridBoxes(chutes)], rng)
  const conveyorCapacity = Math.max(BOX_MARBLE_COUNT, BASE_CONVEYOR_CAPACITY - Math.min(Math.floor(level / 4) * 3, 9))
  const startingPowerUps = sanitizePowerUps(carry.powerUps)

  return {
    version: 1,
    activeColors,
    baseConveyorCapacity: conveyorCapacity,
    boxes,
    chutes,
    clearedBlocks: 0,
    completedLevel: null,
    conveyor: [],
    conveyorCapacity,
    conveyorTicks: 0,
    fallingMarbles: [],
    highScore: safeProgressNumber(carry.highScore),
    lastMessage: `Level ${level} is ready. Bust boxes when the conveyor has space.`,
    gameOver: null,
    level,
    levelScore: 1_000 + level * 120 + totalBoxes * 30,
    moves: 0,
    nextBoxSequence,
    nextMarbleSequence: 1,
    powerUps: startingPowerUps,
    powerUpsUsed: 0,
    seed,
    sortingStacks,
    totalScore: safeProgressNumber(carry.totalScore),
  }
}

function createFallbackLevel(
  level: number,
  seed: number,
  carry: {
    totalScore?: number
    highScore?: number
    powerUps?: PowerUpInventory
  },
): GameState {
  const activeColors = MARBLE_COLOR_KEYS.slice(0, 3)
  const boxes: MarbleBox[] = []
  let nextBoxSequence = 1

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let column = 0; column < GRID_COLUMNS; column += 1) {
      boxes.push({
        color: activeColors[(row + column) % activeColors.length] ?? 'pink',
        hidden: false,
        id: `box-${nextBoxSequence}`,
        position: { column, row },
        source: 'initial',
      })
      nextBoxSequence += 1
    }
  }

  return {
    version: 1,
    activeColors,
    baseConveyorCapacity: BASE_CONVEYOR_CAPACITY,
    boxes,
    chutes: [],
    clearedBlocks: 0,
    completedLevel: null,
    conveyor: [],
    conveyorCapacity: BASE_CONVEYOR_CAPACITY,
    conveyorTicks: 0,
    fallingMarbles: [],
    highScore: safeProgressNumber(carry.highScore),
    lastMessage: `Level ${level} is ready.`,
    gameOver: null,
    level,
    levelScore: 1_000 + level * 120,
    moves: 0,
    nextBoxSequence,
    nextMarbleSequence: 1,
    powerUps: sanitizePowerUps(carry.powerUps),
    powerUpsUsed: 0,
    seed,
    sortingStacks: createSortingStacks(activeColors, boxes, createRng(seed + 17)),
    totalScore: safeProgressNumber(carry.totalScore),
  }
}

function createChutePlans(level: number, rng: RandomGenerator): ChutePlan[] {
  const chuteCount = Math.min(2 + Math.floor(level / 3), 8)
  const plans: ChutePlan[] = []
  const rowOrder = shuffle(Array.from({ length: GRID_ROWS }, (_, row) => row), rng)

  for (let index = 0; index < chuteCount; index += 1) {
    plans.push({
      count: 1 + (level > 7 && rng.next() > 0.55 ? 1 : 0),
      row: rowOrder[index % rowOrder.length] ?? 0,
      side: index % 2 === 0 ? 'left' : 'right',
    })
  }

  return plans
}

function createBalancedColorQueue(colors: MarbleColor[], count: number, rng: RandomGenerator): MarbleColor[] {
  const queue = Array.from({ length: count }, (_, index) => colors[index % colors.length] ?? rng.pick(colors))

  return shuffle(queue, rng)
}

function createSortingStacks(colors: MarbleColor[], boxes: MarbleBox[], rng: RandomGenerator): SortingStack[] {
  const boxCounts = new Map<MarbleColor, number>()
  for (const box of boxes) {
    boxCounts.set(box.color, (boxCounts.get(box.color) ?? 0) + 1)
  }

  const blocks = shuffle(colors.flatMap((color) => (
    Array.from({ length: (boxCounts.get(color) ?? 0) * (BOX_MARBLE_COUNT / SORTING_BLOCK_CAPACITY) }, (_, blockIndex): SortingBlock => ({
      color,
      id: `block-${color}-${blockIndex + 1}`,
      slotsFilled: 0,
    }))
  )), rng)

  const stacks = colors.map((color, index): SortingStack => ({
    blocks: [],
    color,
    id: `stack-${index + 1}`,
    index,
  }))

  blocks.forEach((block, index) => {
    const stack = stacks[index % stacks.length]
    stack?.blocks.push({
      ...block,
      id: `stack-${(index % stacks.length) + 1}-${block.id}`,
    })
  })

  return stacks
}

function chuteBoxesAsGridBoxes(chutes: Chute[]): MarbleBox[] {
  return chutes.flatMap((chute) => chute.queue.map((box, index) => ({
    color: box.color,
    hidden: box.hidden,
    id: `${chute.id}-queued-${index + 1}`,
    position: { column: chute.side === 'left' ? 0 : GRID_COLUMNS - 1, row: chute.row },
    source: 'chute' as const,
  })))
}

function refillGridFromChutes(state: GameState, openedBox: MarbleBox): void {
  const rowChutes = state.chutes
    .filter((chute) => chute.row === openedBox.position.row && chute.remaining > 0 && chute.queue.length > 0)
    .sort((first, second) => chutePriority(first, openedBox.position.column) - chutePriority(second, openedBox.position.column))

  const chute = rowChutes[0]
  const queued = chute?.queue.shift()
  if (!chute || !queued) {
    return
  }

  chute.remaining = chute.queue.length
  state.boxes.push({
    color: queued.color,
    hidden: queued.hidden,
    id: `box-${state.nextBoxSequence}`,
    position: { ...openedBox.position },
    source: 'chute',
  })
  state.nextBoxSequence += 1
}

function chutePriority(chute: Chute, column: number): number {
  if (column === 0 && chute.side === 'left') {
    return 0
  }

  if (column === GRID_COLUMNS - 1 && chute.side === 'right') {
    return 0
  }

  return chute.side === 'left' ? 1 : 2
}

function fillMarbleIntoSortingBlock(state: GameState, marble: ConveyorMarble, stackIndex?: number): boolean {
  const stack = stackIndex === undefined
    ? state.sortingStacks.find((candidate) => candidate.blocks[0]?.color === marble.color)
    : state.sortingStacks.find((candidate) => candidate.index === stackIndex)
  const block = stack?.blocks[0]
  if (!stack || !block || block.color !== marble.color || block.slotsFilled >= SORTING_BLOCK_CAPACITY) {
    return false
  }

  block.slotsFilled += 1
  if (block.slotsFilled >= SORTING_BLOCK_CAPACITY) {
    stack.blocks.shift()
    state.clearedBlocks += 1
    state.levelScore += 12
  }

  return true
}

function checkLevelComplete(state: GameState): GameState {
  if (state.completedLevel || state.gameOver) {
    return state
  }

  if (
    state.boxes.length > 0
    || remainingChuteBoxes(state) > 0
    || state.fallingMarbles.length > 0
    || state.conveyor.length > 0
    || remainingSortingBlocks(state) > 0
  ) {
    return state
  }

  const score = Math.max(100, Math.round(state.levelScore - state.moves * 5 - state.powerUpsUsed * 25))
  const awardedPowerUp = powerUpForSeed(state.seed + state.moves + state.clearedBlocks)
  const powerUps = {
    ...state.powerUps,
    [awardedPowerUp]: state.powerUps[awardedPowerUp] + 1,
  }
  const totalScore = state.totalScore + score
  const completedLevel: CompletedLevel = {
    awardedPowerUp,
    level: state.level,
    score,
  }

  return {
    ...state,
    completedLevel,
    gameOver: null,
    highScore: Math.max(state.highScore, totalScore),
    lastMessage: `Level ${state.level} complete.`,
    powerUps,
    totalScore,
  }
}

function checkBeltFull(state: GameState): GameState {
  if (
    state.completedLevel
    || state.gameOver
    || state.conveyor.length < state.conveyorCapacity
    || hasSortableConveyorMarble(state)
  ) {
    return state
  }

  const gameOver: GameOver = {
    reason: 'belt_full',
    message: 'The conveyor is full. Reset the level and pop boxes in a different order.',
  }

  return {
    ...state,
    gameOver,
    lastMessage: gameOver.message,
  }
}

function hasOpenReceptacleForColor(state: GameState, color: MarbleColor): boolean {
  return state.sortingStacks.some((stack) => stack.blocks[0]?.color === color)
}

function hasSortableConveyorMarble(state: GameState): boolean {
  return state.conveyor.some((marble) => hasOpenReceptacleForColor(state, marble.color))
}

interface PassingSortableMarble {
  marble: ConveyorMarble
  stackIndex: number
}

function findPassingSortableConveyorMarble(state: GameState): PassingSortableMarble | null {
  const slotCount = conveyorSlotCountFor(state.conveyorCapacity, state.conveyor.length)
  const phase = conveyorPhaseForTick(state.conveyorTicks, slotCount)

  for (let index = 0; index < state.conveyor.length; index += 1) {
    const marble = state.conveyor[index]
    if (!marble) {
      continue
    }

    const stackIndex = passingSortingStackIndexForSlot(phase, slotCount, index, state.sortingStacks.length)
    if (stackIndex === undefined) {
      continue
    }

    const stack = state.sortingStacks.find((candidate) => candidate.index === stackIndex)
    if (stack?.blocks[0]?.color !== marble.color) {
      continue
    }

    if (!isLeftmostOpenStackForColor(state, marble.color, stackIndex)) {
      continue
    }

    return { marble, stackIndex }
  }

  return null
}

function isLeftmostOpenStackForColor(state: GameState, color: MarbleColor, stackIndex: number): boolean {
  for (const candidate of state.sortingStacks) {
    if (candidate.index >= stackIndex) {
      continue
    }
    const block = candidate.blocks[0]
    if (block && block.color === color && block.slotsFilled < SORTING_BLOCK_CAPACITY) {
      return false
    }
  }

  return true
}

function leftmostOpenStackIndexForColor(state: GameState, color: MarbleColor): number | undefined {
  let leftmost: number | undefined
  for (const stack of state.sortingStacks) {
    const block = stack.blocks[0]
    if (!block || block.color !== color || block.slotsFilled >= SORTING_BLOCK_CAPACITY) {
      continue
    }
    if (leftmost === undefined || stack.index < leftmost) {
      leftmost = stack.index
    }
  }

  return leftmost
}

function signatureForDrain(state: GameState): string {
  const slotCount = conveyorSlotCountFor(state.conveyorCapacity, state.conveyor.length)

  return [
    state.fallingMarbles.length,
    state.conveyor.length > 0 ? state.conveyorTicks % slotCount : 0,
    state.conveyor.map((marble) => marble.id).join(','),
    state.sortingStacks.map((stack) => `${stack.id}:${stack.blocks.length}:${stack.blocks[0]?.slotsFilled ?? 0}`).join('|'),
  ].join('/')
}

function cloneState(state: GameState): GameState {
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
    powerUps: { ...state.powerUps },
    sortingStacks: state.sortingStacks.map((stack) => ({
      ...stack,
      blocks: stack.blocks.map((block) => ({ ...block })),
    })),
    completedLevel: state.completedLevel ? { ...state.completedLevel } : null,
    gameOver: state.gameOver ? { ...state.gameOver } : null,
  }
}

function powerUpForSeed(seed: number): PowerUpKind {
  return POWER_UPS[Math.abs(seed) % POWER_UPS.length] ?? 'magnet'
}

function shuffle<T>(items: readonly T[], rng: RandomGenerator): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.int(0, index)
    const current = copy[index]
    const swap = copy[swapIndex]
    if (current === undefined || swap === undefined) {
      continue
    }

    copy[index] = swap
    copy[swapIndex] = current
  }

  return copy
}

function createRng(seed: number): RandomGenerator {
  let state = seed >>> 0

  const next = (): number => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0

    return state / 0x1_0000_0000
  }

  return {
    int: (min: number, max: number): number => Math.floor(next() * (max - min + 1)) + min,
    next,
    pick: <T>(items: readonly T[]): T => {
      const item = items[Math.floor(next() * items.length)]
      if (item === undefined) {
        throw new Error('Cannot pick from an empty list.')
      }

      return item
    },
  }
}
