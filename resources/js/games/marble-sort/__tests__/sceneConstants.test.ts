import {
  BASIN_EXIT_HALF_WIDTH,
  BASIN_EXIT_X,
  BASIN_HOLD_CORRIDOR_HALF_WIDTH,
  BASIN_HOLD_LINE_Z,
  BASIN_SOUTH_Z,
  BASIN_TOP_HALF_WIDTH,
  CONVEYOR_BELT_NORTH_Z,
  CONVEYOR_BELT_SOUTH_Z,
  CONVEYOR_PATH_NORTH_Z,
  CONVEYOR_PATH_SOUTH_Z,
  CONVEYOR_WIDTH,
} from '../scene/sceneConstants'
import { CONVEYOR_ENTRY_PROGRESS, conveyorPositionAt } from '../scene/sceneGeometry'

describe('marble sort scene geometry constants', () => {
  it('keeps the funnel exit centred on x = 0', () => {
    expect(BASIN_EXIT_X).toBe(0)
  })

  it('keeps the funnel exit narrower than the basin top', () => {
    expect(BASIN_EXIT_HALF_WIDTH).toBeLessThan(BASIN_TOP_HALF_WIDTH)
  })

  it('places the funnel exit just north of the conveyor belt edge', () => {
    // Negative "overlap" means BASIN_SOUTH_Z is north of the belt's north edge,
    // so marbles physically fall south through the throat onto the belt rather
    // than appearing to jump back northward when transit completes.
    const gap = CONVEYOR_BELT_NORTH_Z - BASIN_SOUTH_Z
    expect(gap).toBeGreaterThanOrEqual(0.04)
    expect(gap).toBeLessThanOrEqual(0.2)
  })

  it('keeps the throat narrower than the belt', () => {
    expect(BASIN_EXIT_HALF_WIDTH * 2).toBeLessThan(CONVEYOR_WIDTH)
  })

  it('places the hold line south of the throat', () => {
    expect(BASIN_HOLD_LINE_Z).toBeGreaterThan(BASIN_SOUTH_Z)
  })

  it('keeps the hold corridor wider than the throat but inside the basin', () => {
    expect(BASIN_HOLD_CORRIDOR_HALF_WIDTH).toBeGreaterThan(BASIN_EXIT_HALF_WIDTH)
    expect(BASIN_HOLD_CORRIDOR_HALF_WIDTH).toBeLessThan(BASIN_TOP_HALF_WIDTH)
  })

  it('keeps the marble path oval strictly inside the visible belt rectangle', () => {
    expect(CONVEYOR_PATH_NORTH_Z).toBeGreaterThan(CONVEYOR_BELT_NORTH_Z)
    expect(CONVEYOR_PATH_SOUTH_Z).toBeLessThan(CONVEYOR_BELT_SOUTH_Z)
  })

  it('puts the conveyor entry at x = 0 on the inner lane north straight', () => {
    const entry = conveyorPositionAt(CONVEYOR_ENTRY_PROGRESS)
    expect(entry.x).toBeCloseTo(0)
    expect(entry.z).toBeCloseTo(CONVEYOR_PATH_NORTH_Z)
  })
})
