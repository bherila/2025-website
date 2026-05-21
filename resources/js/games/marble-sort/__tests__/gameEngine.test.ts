import {
  applyMagnetPowerUp,
  availableConveyorSlots,
  BOX_MARBLE_COUNT,
  drainConveyor,
  type GameState,
  generateLevel,
  isBoxDisplayedAsHidden,
  type MarbleBox,
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
    const next = processConveyorTick(processConveyorTick(processConveyorTick(opened)))

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
    const settled = processConveyorTick(processConveyorTick(processConveyorTick(opened)))

    expect(settled.conveyor).toHaveLength(3)
    expect(settled.fallingMarbles).toHaveLength(BOX_MARBLE_COUNT - 3)
    expect(settled.gameOver).toBeNull()

    const advanced = processConveyorTick(settled)

    expect(advanced.gameOver).toBeNull()
    // Multi-sort: any marble whose slot is in a stack drop window this tick
    // gets sorted, so length can drop by 1+ but must drop below capacity.
    expect(advanced.conveyor.length).toBeLessThan(3)
    expect(advanced.fallingMarbles).toHaveLength(BOX_MARBLE_COUNT - 3)
  })

  it('keeps the conveyor array in physical order when a passing marble cannot sort', () => {
    const state = generateLevel(1, 41_002)
    const matchingColor = state.sortingStacks[0]?.blocks[0]?.color
    const blockedColor = state.activeColors.find((color) => color !== matchingColor)
    if (!matchingColor || !blockedColor) {
      throw new Error('Expected generated level to include at least two colors.')
    }

    const queued = {
      ...state,
      conveyor: [
        { id: 'blocked', color: blockedColor, sequence: 1 },
        { id: 'matching', color: matchingColor, sequence: 2 },
      ],
      conveyorTicks: 0,
      fallingMarbles: [],
      sortingStacks: blockReceptaclesForColor(state, blockedColor),
    }

    const firstPass = processConveyorTick(queued)

    expect(firstPass.conveyor.map((marble) => marble.id)).toEqual(['blocked', 'matching'])
    expect(firstPass.conveyorTicks).toBe(1)

    const secondPass = processConveyorTick(firstPass)

    expect(secondPass.conveyor.map((marble) => marble.id)).toEqual(['blocked'])
  })

  it('only sorts a marble when it is physically beside the matching Lego stack', () => {
    const state = generateLevel(1, 41_003)
    const matchingColor = state.activeColors[0]
    const blockedColor = state.activeColors.find((color) => color !== matchingColor)
    if (!matchingColor || !blockedColor) {
      throw new Error('Expected generated level to include at least two colors.')
    }

    let queued: GameState = {
      ...state,
      conveyor: [
        { id: 'matching', color: matchingColor, sequence: 1 },
      ],
      conveyorCapacity: 27,
      conveyorTicks: 0,
      fallingMarbles: [],
      sortingStacks: setOpenStackColors(state, {
        0: blockedColor,
        1: matchingColor,
        2: blockedColor,
      }),
    }

    for (let tick = 0; tick < 5; tick += 1) {
      queued = processConveyorTick(queued)
    }

    expect(queued.conveyor.map((marble) => marble.id)).toEqual(['matching'])
    expect(queued.conveyorTicks).toBe(5)

    const sorted = processConveyorTick(queued)

    expect(sorted.conveyor).toHaveLength(0)
    expect(sorted.sortingStacks.find((stack) => stack.index === 1)?.blocks[0]?.slotsFilled).toBe(1)
  })

  it('fills the leftmost matching sorting stack before any rightward same-color stack', () => {
    const state = generateLevel(1, 41_003)
    const matchingColor = state.activeColors[0]
    const otherColor = state.activeColors.find((color) => color !== matchingColor)
    if (!matchingColor || !otherColor) {
      throw new Error('Expected generated level to include at least two colors.')
    }

    let queued: GameState = {
      ...state,
      conveyor: Array.from({ length: 2 }, (_, index) => ({
        id: `match-${index}`,
        color: matchingColor,
        sequence: index + 1,
      })),
      conveyorCapacity: 27,
      conveyorTicks: 0,
      fallingMarbles: [],
      sortingStacks: setOpenStackColors(state, {
        0: matchingColor,
        1: otherColor,
        2: matchingColor,
      }),
    }

    for (let tick = 0; tick < 60 && queued.conveyor.length > 0; tick += 1) {
      queued = processConveyorTick(queued)
    }

    const leftStack = queued.sortingStacks.find((stack) => stack.index === 0)
    const rightStack = queued.sortingStacks.find((stack) => stack.index === 2)

    // Both marbles should have entered the leftmost matching stack.
    expect(queued.conveyor).toHaveLength(0)
    expect(rightStack?.blocks[0]?.color).toBe(matchingColor)
    expect(rightStack?.blocks[0]?.slotsFilled ?? 0).toBe(0)
    expect(leftStack?.blocks[0]?.color).toBe(matchingColor)
    expect(leftStack?.blocks[0]?.slotsFilled ?? 0).toBe(2)
  })

  it('magnet power-up only drains marbles into the leftmost matching stack', () => {
    const state = generateLevel(1, 41_004)
    const matchingColor = state.activeColors[0]
    const otherColor = state.activeColors.find((color) => color !== matchingColor)
    if (!matchingColor || !otherColor) {
      throw new Error('Expected generated level to include at least two colors.')
    }

    const queued: GameState = {
      ...state,
      conveyor: [
        { id: 'm1', color: matchingColor, sequence: 1 },
        { id: 'm2', color: matchingColor, sequence: 2 },
      ],
      conveyorCapacity: 27,
      conveyorTicks: 0,
      fallingMarbles: [],
      powerUps: { ...state.powerUps, magnet: 1 },
      sortingStacks: setOpenStackColors(state, {
        0: matchingColor,
        1: otherColor,
        2: matchingColor,
      }),
    }

    const result = applyMagnetPowerUp(queued)
    const rightStack = result.sortingStacks.find((stack) => stack.index === 2)

    // No marbles should have leaked to the rightward matching stack.
    expect(rightStack?.blocks[0]?.color).toBe(matchingColor)
    expect(rightStack?.blocks[0]?.slotsFilled ?? 0).toBe(0)
    // The magnet should have sorted both marbles via the leftmost matching stack.
    expect(result.conveyor).toHaveLength(0)
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

    expect(settled.fallingMarbles).toHaveLength(BOX_MARBLE_COUNT - 1)
    expect(settled.conveyor).toHaveLength(1)

    const drained = drainConveyor(settled)

    expect(remainingSortingBlocks(drained)).toBeLessThan(startingBlocks)
    expect(availableConveyorSlots(drained)).toBeGreaterThan(0)
  })

  it('hides mystery boxes only when all in-grid orthogonal neighbors are still present', () => {
    const make = (column: number, row: number, hidden: boolean): MarbleBox => ({
      color: 'pink',
      hidden,
      id: `b-${column}-${row}`,
      position: { column, row },
      source: 'initial',
    })

    // Interior (1,1) hidden box with all 4 neighbors present should display hidden.
    const fullGrid: MarbleBox[] = []
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        fullGrid.push(make(column, row, column === 1 && row === 1))
      }
    }
    const interior = fullGrid.find((b) => b.position.column === 1 && b.position.row === 1)!
    expect(isBoxDisplayedAsHidden(interior, fullGrid)).toBe(true)

    // Remove the box directly above the hidden one - it should reveal.
    const aboveRemoved = fullGrid.filter((b) => !(b.position.column === 1 && b.position.row === 0))
    expect(isBoxDisplayedAsHidden(interior, aboveRemoved)).toBe(false)

    // Corner box at (0,0): off-grid neighbors count as covered, in-grid neighbors are (1,0) and (0,1).
    const corner = make(0, 0, true)
    const cornerBoxes: MarbleBox[] = [
      corner,
      make(1, 0, false),
      make(0, 1, false),
    ]
    expect(isBoxDisplayedAsHidden(corner, cornerBoxes)).toBe(true)

    // Remove the in-grid neighbor to the right — corner reveals.
    expect(isBoxDisplayedAsHidden(corner, [corner, make(0, 1, false)])).toBe(false)

    // A non-hidden box never displays as hidden.
    const visibleInterior = make(1, 1, false)
    expect(isBoxDisplayedAsHidden(visibleInterior, fullGrid.map((b) => (
      b.position.column === 1 && b.position.row === 1 ? visibleInterior : b
    )))).toBe(false)
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

function setOpenStackColors(
  state: ReturnType<typeof generateLevel>,
  colorsByIndex: Record<number, ReturnType<typeof generateLevel>['activeColors'][number]>,
): ReturnType<typeof generateLevel>['sortingStacks'] {
  return state.sortingStacks.map((stack) => ({
    ...stack,
    blocks: stack.blocks.map((block, blockIndex) => ({
      ...block,
      color: blockIndex === 0 ? (colorsByIndex[stack.index] ?? block.color) : block.color,
    })),
  }))
}
