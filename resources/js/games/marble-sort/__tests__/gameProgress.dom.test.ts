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

  it('preserves generated base conveyor capacity below the level-one default', () => {
    const state = generateLevel(12, 42_012)

    saveLevelSnapshot(state)

    expect(loadLevelSnapshot(undefined, {
      ...createInitialProgress(),
      level: state.level,
    })?.baseConveyorCapacity).toBe(state.baseConveyorCapacity)
  })

  it('preserves a belt-full game over snapshot until reset', () => {
    const state = {
      ...generateLevel(1, 42_001),
      gameOver: {
        message: 'The conveyor is full. Reset the level and pop boxes in a different order.',
        reason: 'belt_full' as const,
      },
    }

    saveLevelSnapshot(state)

    expect(loadLevelSnapshot()?.gameOver?.reason).toBe('belt_full')
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

  it('preserves slotIndex on conveyor marbles across save/load', () => {
    const base = generateLevel(1, 42_010)
    const state = {
      ...base,
      conveyor: [
        { id: 'm1', color: base.activeColors[0]!, sequence: 1, slotIndex: 0 },
        { id: 'm2', color: base.activeColors[1]!, sequence: 2, slotIndex: 7 },
      ],
    }

    saveLevelSnapshot(state)
    const loaded = loadLevelSnapshot()

    expect(loaded?.conveyor.map((marble) => ({ id: marble.id, slotIndex: marble.slotIndex }))).toEqual([
      { id: 'm1', slotIndex: 0 },
      { id: 'm2', slotIndex: 7 },
    ])
  })

  it('rejects a snapshot whose conveyor marbles are missing slotIndex', () => {
    const state = generateLevel(1, 42_011)
    const malformed = {
      version: 1,
      state: {
        ...state,
        conveyor: [{ id: 'm1', color: state.activeColors[0], sequence: 1 }],
      },
    }
    window.localStorage.setItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY, JSON.stringify(malformed))

    expect(loadLevelSnapshot()).toBeNull()
  })

  it('does not read from the legacy v1 snapshot key', () => {
    window.localStorage.setItem('bwh.marble-sort.snapshot.v1', JSON.stringify({
      version: 1,
      state: generateLevel(1, 42_013),
    }))

    expect(loadLevelSnapshot()).toBeNull()
  })
})
