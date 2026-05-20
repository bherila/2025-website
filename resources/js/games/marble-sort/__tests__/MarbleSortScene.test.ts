import {
  conveyorSlotProgress,
  easeConveyorOffset,
  preserveConveyorOffsetsForOrderChange,
  stabilizeConveyorPhaseForOrderChange,
} from '../scene/conveyorProgress'

describe('MarbleSortScene conveyor animation bookkeeping', () => {
  it('keeps existing marbles in place when the logical conveyor queue rotates', () => {
    const offsets = new Map([
      ['a', 0],
      ['b', 0],
      ['c', 0],
      ['d', 0],
    ])
    const phase = 0.25
    const nextPhase = stabilizeConveyorPhaseForOrderChange(
      phase,
      ['a', 'b', 'c', 'd'],
      ['b', 'c', 'd', 'a'],
      27,
      27,
    )

    preserveConveyorOffsetsForOrderChange(
      offsets,
      ['a', 'b', 'c', 'd'],
      ['b', 'c', 'd', 'a'],
      phase,
      nextPhase,
      27,
      27,
    )

    expect(conveyorSlotProgress(nextPhase, 27, 0) + (offsets.get('b') ?? 0)).toBeCloseTo(conveyorSlotProgress(phase, 27, 1))
    expect(conveyorSlotProgress(nextPhase, 27, 1) + (offsets.get('c') ?? 0)).toBeCloseTo(conveyorSlotProgress(phase, 27, 2))
    expect(conveyorSlotProgress(nextPhase, 27, 2) + (offsets.get('d') ?? 0)).toBeCloseTo(conveyorSlotProgress(phase, 27, 3))
    expect(conveyorSlotProgress(nextPhase, 27, 3) + (offsets.get('a') ?? 0)).toBeCloseTo(conveyorSlotProgress(phase, 27, 0))
  })

  it('eases the rotated front marble into the tail slot without moving other marbles', () => {
    const offsets = new Map([
      ['a', 0],
      ['b', 0],
      ['c', 0],
      ['d', 0],
    ])
    const phase = 0.25
    const nextPhase = stabilizeConveyorPhaseForOrderChange(
      phase,
      ['a', 'b', 'c', 'd'],
      ['b', 'c', 'd', 'a'],
      27,
      27,
    )

    preserveConveyorOffsetsForOrderChange(
      offsets,
      ['a', 'b', 'c', 'd'],
      ['b', 'c', 'd', 'a'],
      phase,
      nextPhase,
      27,
      27,
    )

    expect(offsets.get('b')).toBeCloseTo(0)
    expect(offsets.get('c')).toBeCloseTo(0)
    expect(offsets.get('d')).toBeCloseTo(0)
    expect(offsets.get('a')).toBeCloseTo(-(4 / 27))
    expect(easeConveyorOffset(offsets.get('a') ?? 0, 0.09)).toBeGreaterThan(offsets.get('a') ?? 0)
    expect(easeConveyorOffset(offsets.get('a') ?? 0, 0.18)).toBe(0)
  })

  it('assigns new marbles to their own canonical slots and removes exited marbles', () => {
    const offsets = new Map([
      ['a', 0],
      ['b', 0],
      ['removed', 0.12],
    ])

    preserveConveyorOffsetsForOrderChange(
      offsets,
      ['a', 'b', 'removed'],
      ['a', 'b', 'c', 'd'],
      0.25,
      0.25,
      27,
      27,
    )

    expect(offsets.get('a')).toBeCloseTo(0)
    expect(offsets.get('b')).toBeCloseTo(0)
    expect(offsets.get('c')).toBeCloseTo(0)
    expect(offsets.get('d')).toBeCloseTo(0)
    expect(offsets.has('removed')).toBe(false)
    expect(conveyorSlotProgress(0.25, 27, 2)).not.toBeCloseTo(conveyorSlotProgress(0.25, 27, 3))
  })
})
