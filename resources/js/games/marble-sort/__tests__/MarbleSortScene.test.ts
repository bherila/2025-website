import { assignMissingConveyorProgress, pruneConveyorProgress } from '../scene/conveyorProgress'

describe('MarbleSortScene conveyor animation bookkeeping', () => {
  it('preserves existing marble positions when the logical conveyor queue rotates', () => {
    const progress = new Map([
      ['a', 0.15],
      ['b', 0.20],
      ['c', 0.25],
      ['d', 0.30],
    ])

    assignMissingConveyorProgress(progress, ['b', 'c', 'd', 'a'], 27, 0.5)

    expect(progress.get('a')).toBeCloseTo(0.15)
    expect(progress.get('b')).toBeCloseTo(0.20)
    expect(progress.get('c')).toBeCloseTo(0.25)
    expect(progress.get('d')).toBeCloseTo(0.30)
  })

  it('slots new marbles after the previous conveyor neighbor', () => {
    const progress = new Map([
      ['a', 0.15],
      ['b', 0.20],
    ])

    assignMissingConveyorProgress(progress, ['a', 'b', 'c', 'd'], 27, 0.5)

    expect(progress.get('c')).toBeCloseTo(0.20 + (1 / 27))
    expect(progress.get('d')).toBeCloseTo(0.20 + (2 / 27))
  })

  it('removes progress for marbles that left the belt', () => {
    const progress = new Map([
      ['a', 0.15],
      ['b', 0.20],
      ['c', 0.25],
    ])

    pruneConveyorProgress(progress, new Set(['b', 'c']))

    expect(progress.has('a')).toBe(false)
    expect(progress.get('b')).toBeCloseTo(0.20)
    expect(progress.get('c')).toBeCloseTo(0.25)
  })
})
