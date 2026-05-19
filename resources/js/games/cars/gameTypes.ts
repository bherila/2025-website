export const GAME_PROGRESS_STORAGE_KEY = 'bwh.cars-game.progress.v1'

export const CAR_COLORS = {
  red: { label: 'Red', hex: '#ef4444' },
  blue: { label: 'Blue', hex: '#0ea5e9' },
  green: { label: 'Green', hex: '#22c55e' },
  yellow: { label: 'Yellow', hex: '#facc15' },
  purple: { label: 'Purple', hex: '#a855f7' },
  orange: { label: 'Orange', hex: '#f97316' },
  cyan: { label: 'Cyan', hex: '#22d3ee' },
  brown: { label: 'Brown', hex: '#92400e' },
} as const

export type CarColor = keyof typeof CAR_COLORS

export const CAR_PATTERN_VALUES = [
  'dot',
  'stripe',
  'triangle',
  'star',
  'diamond',
  'chevron',
  'ring',
  'crosshatch',
] as const

export type CarPattern = typeof CAR_PATTERN_VALUES[number]

export const CAR_PATTERNS = {
  red: 'dot',
  blue: 'stripe',
  green: 'triangle',
  yellow: 'star',
  purple: 'diamond',
  orange: 'chevron',
  cyan: 'ring',
  brown: 'crosshatch',
} as const satisfies Record<CarColor, CarPattern>

export type Direction = 'up' | 'right' | 'down' | 'left'

export type CarStatus = 'field' | 'hidden' | 'parked' | 'departed'

export type ParkingSlotKind = 'regular' | 'vip'

export type PowerUpKind = 'vip' | 'shuffle' | 'fill'

export interface GridPosition {
  x: number
  y: number
}

export interface Car {
  id: string
  color: CarColor
  direction: Direction
  capacity: number
  length: number
  position: GridPosition
  status: CarStatus
  parkingSlotId: string | null
  boarded: number
  tunnelId: string | null
  sequence: number
}

export interface Tunnel {
  id: string
  position: GridPosition
  garagePosition: GridPosition
  direction: Direction
  carIds: string[]
  visibleCarId: string | null
  remaining: number
}

export type FeederSide = 'left' | 'right'

export interface Passenger {
  id: string
  color: CarColor
  feederSide?: FeederSide
}

export interface ParkingSlot {
  id: string
  kind: ParkingSlotKind
  unlocked: boolean
  occupiedCarId: string | null
  index: number
}

export interface PowerUpInventory {
  vip: number
  shuffle: number
  fill: number
}

export interface CompletedLevel {
  level: number
  score: number
  awardedPowerUp: PowerUpKind
}

export interface GameState {
  version: 1
  level: number
  seed: number
  boardWidth: number
  boardHeight: number
  cars: Car[]
  tunnels: Tunnel[]
  passengerQueue: Passenger[]
  parkingSlots: ParkingSlot[]
  powerUps: PowerUpInventory
  levelScore: number
  totalScore: number
  highScore: number
  moves: number
  maxRegularSlotsUsed: number
  maxRegularSlotsUnlocked: number
  lastMessage: string
  completedLevel: CompletedLevel | null
}

export interface SavedGameProgress {
  version: 1
  level: number
  totalScore: number
  highScore: number
  powerUps: PowerUpInventory
}

export const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left']
export const CAPACITIES = [2, 4, 6] as const
export const STARTING_REGULAR_SLOTS = 4
export const TOTAL_REGULAR_SLOTS = 7
export const BOARD_WIDTH = 14
export const BOARD_HEIGHT = 9
export const MIN_LOOP_PASSENGERS = 16
export const MAX_LOOP_PASSENGERS = 30
