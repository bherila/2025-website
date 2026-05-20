import {
  clearLevelSnapshot,
  createInitialProgress,
  generateLevel,
  loadLevelSnapshot,
  loadProgress,
  MARBLE_SORT_PROGRESS_STORAGE_KEY,
  MARBLE_SORT_SNAPSHOT_STORAGE_KEY,
  progressFromState,
  saveLevelSnapshot,
  saveProgress,
} from '../gameEngine'

describe('marble sort progress persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('loads initial progress when storage is missing or invalid', () => {
    expect(loadProgress()).toEqual(createInitialProgress())

    window.localStorage.setItem(MARBLE_SORT_PROGRESS_STORAGE_KEY, '{"version":1,"level":0}')

    expect(loadProgress()).toEqual(createInitialProgress())
  })

  it('saves and loads progress with sanitized power-up counts', () => {
    saveProgress({
      highScore: 200,
      level: 4,
      powerUps: { extraBelt: 1, magnet: 2, shuffle: 3 },
      totalScore: 120,
      version: 1,
    })

    expect(loadProgress()).toEqual({
      highScore: 200,
      level: 4,
      powerUps: { extraBelt: 1, magnet: 2, shuffle: 3 },
      totalScore: 120,
      version: 1,
    })
  })

  it('saves, loads, and clears an active level snapshot', () => {
    const state = generateLevel(1, 42_000)

    saveLevelSnapshot(state)

    expect(loadLevelSnapshot()?.seed).toBe(state.seed)
    expect(loadLevelSnapshot()?.boxes).toEqual(state.boxes)

    clearLevelSnapshot()

    expect(window.localStorage.getItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY)).toBeNull()
  })

  it('advances saved progress after a completed state', () => {
    const completed = {
      ...generateLevel(1, 41_000),
      completedLevel: { awardedPowerUp: 'magnet' as const, level: 1, score: 100 },
      totalScore: 100,
    }

    expect(progressFromState(completed)).toMatchObject({
      level: 2,
      totalScore: 100,
    })
  })
})
