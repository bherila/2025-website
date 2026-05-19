import {
  GAME_PROGRESS_STORAGE_KEY,
  type GameState,
  type PowerUpInventory,
  type SavedGameProgress,
} from './gameTypes'

export function createInitialPowerUps(): PowerUpInventory {
  return {
    vip: 0,
    shuffle: 0,
    fill: 0,
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
    const raw = storage.getItem(GAME_PROGRESS_STORAGE_KEY)
    if (!raw) {
      return createInitialProgress()
    }

    const parsed = JSON.parse(raw) as Partial<SavedGameProgress>
    const parsedLevel = parsed.level
    if (parsed.version !== 1 || typeof parsedLevel !== 'number' || !Number.isInteger(parsedLevel) || parsedLevel < 1) {
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

  storage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify(progress))
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

function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

export function sanitizePowerUps(powerUps: unknown): PowerUpInventory {
  const candidate = powerUps as Partial<PowerUpInventory> | undefined

  return {
    vip: Math.max(0, safeProgressNumber(candidate?.vip)),
    shuffle: Math.max(0, safeProgressNumber(candidate?.shuffle)),
    fill: Math.max(0, safeProgressNumber(candidate?.fill)),
  }
}

export function safeProgressNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
