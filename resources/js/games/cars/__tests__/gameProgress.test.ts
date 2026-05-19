import { generateLevel } from '../gameEngine'
import {
  clearLevelSnapshot,
  createInitialProgress,
  LEVEL_SNAPSHOT_STORAGE_KEY,
  loadLevelSnapshot,
  saveLevelSnapshot,
} from '../gameProgress'

describe('cars game level snapshots', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('saves, loads, and clears a mid-level snapshot', () => {
    const state = generateLevel(3, 20_003, {
      powerUps: { fill: 1, shuffle: 2, vip: 3 },
      totalScore: 900,
      highScore: 1100,
    })
    state.moves = 2
    state.maxRegularSlotsUsed = 3
    state.maxRegularSlotsUnlocked = 5

    saveLevelSnapshot(state)

    const loaded = loadLevelSnapshot(undefined, {
      ...createInitialProgress(),
      level: 3,
    })

    expect(loaded).toEqual(state)

    clearLevelSnapshot()

    expect(window.localStorage.getItem(LEVEL_SNAPSHOT_STORAGE_KEY)).toBeNull()
    expect(loadLevelSnapshot(undefined, {
      ...createInitialProgress(),
      level: 3,
    })).toBeNull()
  })

  it('rejects version and progress-level mismatches', () => {
    const state = generateLevel(4, 20_004)

    window.localStorage.setItem(LEVEL_SNAPSHOT_STORAGE_KEY, JSON.stringify({
      version: 2,
      state,
    }))

    expect(loadLevelSnapshot(undefined, {
      ...createInitialProgress(),
      level: 4,
    })).toBeNull()

    saveLevelSnapshot(state)

    expect(loadLevelSnapshot(undefined, {
      ...createInitialProgress(),
      level: 5,
    })).toBeNull()
  })

  it('rejects snapshots with missing required state fields', () => {
    const state = generateLevel(2, 20_002)

    window.localStorage.setItem(LEVEL_SNAPSHOT_STORAGE_KEY, JSON.stringify({
      version: 1,
      state: {
        ...state,
        cars: undefined,
      },
    }))

    expect(loadLevelSnapshot(undefined, {
      ...createInitialProgress(),
      level: 2,
    })).toBeNull()
  })
})
