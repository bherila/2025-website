import {
  arriveFallingMarble,
  type GameState,
} from '../gameEngine'
import { conveyorPhaseForTick } from '../scene/conveyorProgress'
import { entrySlotIndexForPhase } from '../scene/conveyorSlots'

const CAPACITY = 27

interface FixtureOverrides {
  conveyorCapacity?: number
  conveyorTicks?: number
}

function makeStateWithOneFallingMarble(overrides: FixtureOverrides = {}): GameState {
  return {
    version: 1,
    activeColors: ['blue', 'yellow', 'red'],
    baseConveyorCapacity: overrides.conveyorCapacity ?? CAPACITY,
    boxes: [],
    chutes: [],
    clearedBlocks: 0,
    completedLevel: null,
    conveyor: [],
    conveyorCapacity: overrides.conveyorCapacity ?? CAPACITY,
    conveyorTicks: overrides.conveyorTicks ?? 0,
    fallingMarbles: [{
      color: 'blue',
      from: { column: 0, row: 0 },
      id: 'marble-1',
      sequence: 1,
    }],
    gameOver: null,
    highScore: 0,
    lastMessage: '',
    level: 1,
    levelScore: 1_000,
    moves: 0,
    nextBoxSequence: 1,
    nextMarbleSequence: 2,
    powerUps: { extraBelt: 0, magnet: 0, shuffle: 0 },
    powerUpsUsed: 0,
    seed: 1,
    sortingStacks: [],
    totalScore: 0,
  }
}

describe('arriveFallingMarble (slot-based)', () => {
  it('accepts the marble into the slot at the funnel mouth without bumping conveyorTicks', () => {
    const state = makeStateWithOneFallingMarble({ conveyorCapacity: CAPACITY, conveyorTicks: 0 })
    const phase = conveyorPhaseForTick(state.conveyorTicks, state.conveyorCapacity)
    const expectedSlot = entrySlotIndexForPhase(phase, state.conveyorCapacity)

    const next = arriveFallingMarble(state, 'marble-1')

    expect(next.fallingMarbles).toHaveLength(0)
    expect(next.conveyor).toEqual([
      expect.objectContaining({ id: 'marble-1', slotIndex: expectedSlot }),
    ])
    expect(next.conveyorTicks).toBe(state.conveyorTicks)
  })

  it('leaves the marble falling when the funnel-mouth slot is occupied', () => {
    const baseline = makeStateWithOneFallingMarble({ conveyorCapacity: CAPACITY, conveyorTicks: 0 })
    const phase = conveyorPhaseForTick(baseline.conveyorTicks, baseline.conveyorCapacity)
    const occupiedSlot = entrySlotIndexForPhase(phase, baseline.conveyorCapacity)
    const blocked: GameState = {
      ...baseline,
      conveyor: [{ id: 'occupied', color: 'red', sequence: 99, slotIndex: occupiedSlot }],
    }

    const next = arriveFallingMarble(blocked, 'marble-1')

    expect(next).toBe(blocked)
    expect(next.fallingMarbles.map((marble) => marble.id)).toContain('marble-1')
    expect(next.conveyor).toHaveLength(1)
    expect(next.conveyorTicks).toBe(blocked.conveyorTicks)
  })

  it('different conveyorTicks values change which slot the marble lands in', () => {
    const earlier = arriveFallingMarble(
      makeStateWithOneFallingMarble({ conveyorTicks: 0 }),
      'marble-1',
    )
    const later = arriveFallingMarble(
      makeStateWithOneFallingMarble({ conveyorTicks: 5 }),
      'marble-1',
    )

    expect(earlier.conveyor[0]?.slotIndex).not.toBe(later.conveyor[0]?.slotIndex)
  })

  it('is a no-op when no falling marble with that id exists', () => {
    const state = makeStateWithOneFallingMarble()
    const next = arriveFallingMarble(state, 'unknown-marble')

    expect(next).toBe(state)
  })
})
