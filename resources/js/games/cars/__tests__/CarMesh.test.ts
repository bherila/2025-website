import { carVisualMetrics } from '../scene/builders/carMesh'
import { CELL_SIZE } from '../scene/sceneConstants'

describe('Parking Pickup car visuals', () => {
  it('uses the same field-car width for cardinal and diagonal cars', () => {
    const straight = carVisualMetrics({ length: 3 }, false)
    const diagonal = carVisualMetrics({ length: 3 }, false)

    expect(diagonal.carWidth).toBeCloseTo(straight.carWidth)
  })

  it('keeps visual length tied to grid length instead of direction', () => {
    const short = carVisualMetrics({ length: 2 }, false)
    const medium = carVisualMetrics({ length: 3 }, false)
    const long = carVisualMetrics({ length: 4 }, false)

    expect(medium.carLength - short.carLength).toBeCloseTo(long.carLength - medium.carLength)
  })

  it('places the arrow and counter on the head side with a fixed counter size', () => {
    const metrics = carVisualMetrics({ length: 4 }, false)

    expect(metrics.decalZ).toBeGreaterThan(0)
    expect(metrics.counterZ).toBeGreaterThan(0)
    expect(metrics.counterSize).toBeCloseTo(carVisualMetrics({ length: 2 }, false).counterSize)
  })

  it('uses chunkier field-car proportions for mobile readability', () => {
    const metrics = carVisualMetrics({ length: 3 }, false)

    expect(metrics.carWidth).toBeCloseTo(CELL_SIZE * 0.74)
    expect(metrics.counterSize).toBeCloseTo(0.34)
    expect(metrics.decalSize).toBeGreaterThan(CELL_SIZE * 0.62)
  })
})
