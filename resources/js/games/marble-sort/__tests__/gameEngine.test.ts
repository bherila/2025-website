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

  it('randomizes receptacle block order across stack colors', () => {
    const state = generateLevel(5, 45_000)

    expect(state.sortingStacks.some((stack) => {
      const colors = new Set(stack.blocks.map((block) => block.color))

      return colors.size > 1
    })).toBe(true)
  })

  it('ends the level when falling marbles fill the conveyor', () => {
    const state = generateLevel(1, 41_000)
    const box = state.boxes[0]
    if (!box) {
      throw new Error('Expected generated level to include boxes.')
    }

    const opened = openBox({
      ...state,
      conveyorCapacity: 3,
      sortingStacks: blockReceptaclesForColor(state, box.color),
    }, box.id)
    const next = processConveyorTick(opened)

    expect(next.gameOver?.reason).toBe('belt_full')
    expect(next.conveyor).toHaveLength(3)
    expect(next.lastMessage).toMatch(/conveyor is full/i)
  })

  it('lets a full conveyor sort before declaring belt full', () => {
    const state = {
      ...generateLevel(1, 41_001),
      conveyorCapacity: 3,
    }
    const box = findBoxForOpenReceptacle(state)
    if (!box) {
      throw new Error('Expected generated level to include a box matching an open receptacle.')
    }

    const opened = openBox(state, box.id)
    const settled = processConveyorTick(opened)

    expect(settled.conveyor).toHaveLength(3)
    expect(settled.fallingMarbles).toHaveLength(BOX_MARBLE_COUNT - 3)
    expect(settled.gameOver).toBeNull()

    const advanced = processConveyorTick(settled)

    expect(advanced.gameOver).toBeNull()
    expect(advanced.conveyor).toHaveLength(2)
    expect(advanced.fallingMarbles).toHaveLength(BOX_MARBLE_COUNT - 3)
  })

  it('settles falling marbles onto the conveyor in batches and sorts matching receptacles', () => {
    const state = generateLevel(1, 41_001)
    const box = findBoxForOpenReceptacle(state)
    if (!box) {
      throw new Error('Expected generated level to include a box matching an open receptacle.')
    }
    const startingBlocks = remainingSortingBlocks(state)
    const opened = openBox(state, box.id)
    const settled = processConveyorTick(opened)

    expect(settled.fallingMarbles).toHaveLength(BOX_MARBLE_COUNT - 3)
    expect(settled.conveyor).toHaveLength(3)

    const drained = drainConveyor(settled)

    expect(remainingSortingBlocks(drained)).toBeLessThan(startingBlocks)
    expect(availableConveyorSlots(drained)).toBeGreaterThan(0)
  })

  it('can solve a full level through public engine actions', () => {
    let state = generateLevel(3, 43_000)

    for (let guard = 0; guard < 200 && !state.completedLevel; guard += 1) {
      state = drainConveyor(state)
      const nextBox = findBoxForOpenReceptacle(state)
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

function findBoxForOpenReceptacle(state: ReturnType<typeof generateLevel>) {
  const openColors = new Set(state.sortingStacks.map((stack) => stack.blocks[0]?.color).filter(Boolean))

  return state.boxes.find((box) => openColors.has(box.color))
}

function blockReceptaclesForColor(
  state: ReturnType<typeof generateLevel>,
  blockedColor: ReturnType<typeof generateLevel>['activeColors'][number],
): ReturnType<typeof generateLevel>['sortingStacks'] {
  const replacementColor = state.activeColors.find((color) => color !== blockedColor) ?? 'pink'

  return state.sortingStacks.map((stack) => ({
    ...stack,
    blocks: stack.blocks.map((block) => ({
      ...block,
      color: block.color === blockedColor ? replacementColor : block.color,
    })),
  }))
}
