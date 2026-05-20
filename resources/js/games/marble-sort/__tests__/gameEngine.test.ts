import {
  availableConveyorSlots,
  BOX_MARBLE_COUNT,
  drainConveyor,
  generateLevel,
  openBox,
  processConveyorTick,
  remainingChuteBoxes,
  remainingSortingBlocks,
  solverCompletesLevel,
} from '../gameEngine'

describe('marble sort game engine', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('generates deterministic solvable levels', () => {
    for (let level = 1; level <= 8; level += 1) {
      const first = generateLevel(level, 40_000 + level)
      const second = generateLevel(level, 40_000 + level)

      expect(first.boxes).toEqual(second.boxes)
      expect(first.chutes).toEqual(second.chutes)
      expect(first.sortingStacks).toEqual(second.sortingStacks)
      expect(solverCompletesLevel(first)).toBe(true)
    }
  })

  it('opens a box, releases nine marbles, and refills from a row chute', () => {
    const state = generateLevel(6, 46_000)
    const chute = state.chutes.find((candidate) => candidate.remaining > 0)
    if (!chute) {
      throw new Error('Expected generated level to include a chute.')
    }
    const box = state.boxes.find((candidate) => candidate.position.row === chute.row)
    if (!box) {
      throw new Error('Expected a box in the chute row.')
    }

    const next = openBox(state, box.id)
    const replacement = next.boxes.find((candidate) => (
      candidate.position.row === box.position.row
      && candidate.position.column === box.position.column
    ))

    expect(next.moves).toBe(1)
    expect(next.fallingMarbles).toHaveLength(BOX_MARBLE_COUNT)
    expect(replacement?.source).toBe('chute')
    expect(remainingChuteBoxes(next)).toBe(remainingChuteBoxes(state) - 1)
  })

  it('blocks box opening when the conveyor does not have room for all marbles', () => {
    const state = {
      ...generateLevel(1, 41_000),
      conveyorCapacity: BOX_MARBLE_COUNT - 1,
    }
    const box = state.boxes[0]
    if (!box) {
      throw new Error('Expected generated level to include boxes.')
    }

    const next = openBox(state, box.id)

    expect(next).not.toBe(state)
    expect(next.boxes).toHaveLength(state.boxes.length)
    expect(next.fallingMarbles).toHaveLength(0)
    expect(next.lastMessage).toMatch(/too full/i)
  })

  it('settles falling marbles onto the conveyor and sorts them into 3-slot blocks', () => {
    const state = generateLevel(1, 41_001)
    const box = state.boxes[0]
    if (!box) {
      throw new Error('Expected generated level to include boxes.')
    }
    const startingBlocks = remainingSortingBlocks(state)
    const opened = openBox(state, box.id)
    const settled = processConveyorTick(opened)

    expect(settled.fallingMarbles).toHaveLength(0)
    expect(settled.conveyor).toHaveLength(BOX_MARBLE_COUNT)

    const drained = drainConveyor(settled)

    expect(drained.conveyor).toHaveLength(0)
    expect(remainingSortingBlocks(drained)).toBe(startingBlocks - 3)
    expect(availableConveyorSlots(drained)).toBe(drained.conveyorCapacity)
  })

  it('can solve a full level through public engine actions', () => {
    let state = generateLevel(3, 43_000)

    for (let guard = 0; guard < 200 && !state.completedLevel; guard += 1) {
      state = drainConveyor(state)
      const nextBox = state.boxes[0]
      if (!nextBox) {
        state = drainConveyor(state)
        break
      }

      state = openBox(state, nextBox.id)
    }

    state = drainConveyor(state)

    expect(state.completedLevel?.level).toBe(3)
    expect(state.totalScore).toBeGreaterThan(0)
  })
})
