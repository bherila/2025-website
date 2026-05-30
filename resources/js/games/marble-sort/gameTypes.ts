export const MARBLE_SORT_PROGRESS_STORAGE_KEY = 'bwh.marble-sort.progress.v1'

export const GRID_COLUMNS = 3
export const GRID_ROWS = 5
export const BOX_MARBLE_COUNT = 9
export const SORTING_BLOCK_CAPACITY = 3
export const BASE_CONVEYOR_CAPACITY = 27

export const MARBLE_COLORS = {
  blue: { label: 'blue', hex: '#2f7bf6' },
  yellow: { label: 'yellow', hex: '#ffce1f' },
  purple: { label: 'purple', hex: '#b15cff' },
  green: { label: 'green', hex: '#2fd16a' },
  red: { label: 'red', hex: '#ff5277' },
  orange: { label: 'orange', hex: '#ff9f1c' },
  black: { label: 'black', hex: '#2c313c' },
  white: { label: 'white', hex: '#f2fbff' },
} as const

export type MarbleColor = keyof typeof MARBLE_COLORS

export const MARBLE_PATTERN_VALUES = [
  'dot',
  'stripe',
  'triangle',
  'star',
  'diamond',
  'chevron',
  'ring',
  'crosshatch',
] as const

export type MarblePattern = typeof MARBLE_PATTERN_VALUES[number]

export const MARBLE_PATTERNS = {
  blue: 'dot',
  yellow: 'stripe',
  purple: 'triangle',
  green: 'star',
  red: 'diamond',
  orange: 'chevron',
  black: 'ring',
  white: 'crosshatch',
} as const satisfies Record<MarbleColor, MarblePattern>

export type ChuteSide = 'left' | 'right'
export type PowerUpKind = 'magnet' | 'shuffle' | 'extraBelt'

export interface GridPosition {
  column: number
  row: number
}

export interface MarbleBox {
  id: string
  color: MarbleColor
  hidden: boolean
  position: GridPosition
  source: 'initial' | 'chute'
}

export interface QueuedChuteBox {
  color: MarbleColor
  hidden: boolean
}

export interface Chute {
  id: string
  row: number
  side: ChuteSide
  remaining: number
  queue: QueuedChuteBox[]
}

interface MarbleBase {
  id: string
  color: MarbleColor
  sequence: number
}

export interface ConveyorMarble extends MarbleBase {
  slotIndex: number
}

export interface FallingMarble extends MarbleBase {
  from: GridPosition
}

export interface SortingBlock {
  id: string
  color: MarbleColor
  slotsFilled: number
}

export interface SortingStack {
  id: string
  color: MarbleColor
  index: number
  blocks: SortingBlock[]
}

export interface PowerUpInventory {
  magnet: number
  shuffle: number
  extraBelt: number
}

export interface CompletedLevel {
  awardedPowerUp: PowerUpKind
  level: number
  score: number
}

export interface GameOver {
  reason: 'belt_full'
  message: string
}

export interface GameState {
  version: 1
  level: number
  seed: number
  boxes: MarbleBox[]
  chutes: Chute[]
  conveyor: ConveyorMarble[]
  fallingMarbles: FallingMarble[]
  sortingStacks: SortingStack[]
  activeColors: MarbleColor[]
  conveyorCapacity: number
  baseConveyorCapacity: number
  levelScore: number
  totalScore: number
  highScore: number
  moves: number
  powerUpsUsed: number
  clearedBlocks: number
  nextBoxSequence: number
  nextMarbleSequence: number
  conveyorTicks: number
  powerUps: PowerUpInventory
  lastMessage: string
  completedLevel: CompletedLevel | null
  gameOver: GameOver | null
}

export interface SavedGameProgress {
  version: 1
  level: number
  totalScore: number
  highScore: number
  powerUps: PowerUpInventory
}
