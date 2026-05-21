import {
  BASIN_EXIT_HALF_WIDTH,
  BASIN_EXIT_X,
  BASIN_HOLD_CORRIDOR_HALF_WIDTH,
  BASIN_HOLD_LINE_Z,
  BASIN_SOUTH_Z,
  BASIN_TOP_HALF_WIDTH,
  CONVEYOR_BELT_NORTH_Z,
  CONVEYOR_WIDTH,
} from '../scene/sceneConstants'

describe('marble sort scene geometry constants', () => {
  it('keeps the funnel exit centred on x = 0', () => {
    expect(BASIN_EXIT_X).toBe(0)
  })

  it('keeps the funnel exit narrower than the basin top', () => {
    expect(BASIN_EXIT_HALF_WIDTH).toBeLessThan(BASIN_TOP_HALF_WIDTH)
  })

  it('overlaps the funnel exit with the conveyor belt north edge', () => {
    const overlap = BASIN_SOUTH_Z - CONVEYOR_BELT_NORTH_Z
    expect(overlap).toBeGreaterThanOrEqual(0.04)
    expect(overlap).toBeLessThanOrEqual(0.2)
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
})
