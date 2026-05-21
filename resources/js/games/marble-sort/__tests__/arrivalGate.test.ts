import {
  BOX_MARBLE_COUNT,
  isBoxOpenable,
  openBox,
  startGameFromProgress,
} from '../gameEngine'
import {
  ARRIVAL_CAPTURE_HALF_WIDTH,
  ARRIVAL_RETRY_COOLDOWN,
  ARRIVAL_Z_TOLERANCE,
  shouldReportArrival,
} from '../scene/arrivalGate'
import {
  createPhysicsWorld,
  disposePhysicsWorld,
  spawnMarbleBody,
  stepPhysics,
} from '../scene/physics/world'
import {
  BASIN_HOLD_CORRIDOR_HALF_WIDTH,
  BASIN_HOLD_LINE_Z,
  BASIN_SOUTH_Z,
  MARBLE_RADIUS,
} from '../scene/sceneConstants'
import { gridCellPosition } from '../scene/sceneGeometry'

const ID = 'marble-1'

function bodyAt(x: number, z: number): { position: { x: number, z: number } } {
  return { position: { x, z } }
}

describe('shouldReportArrival', () => {
  it('returns false when the marble has not reached the throat z threshold', () => {
    const fallingIds = new Set([ID])
    const attempts = new Map<string, number>()
    const body = bodyAt(0, BASIN_SOUTH_Z - ARRIVAL_Z_TOLERANCE - 0.01)
    expect(shouldReportArrival(ID, body, fallingIds, attempts, 1)).toBe(false)
  })

  it('returns true when the marble crosses the threshold for the first time', () => {
    const fallingIds = new Set([ID])
    const attempts = new Map<string, number>()
    const body = bodyAt(0, BASIN_SOUTH_Z)
    expect(shouldReportArrival(ID, body, fallingIds, attempts, 1)).toBe(true)
  })

  it('rejects marbles outside the arrival capture X range', () => {
    const fallingIds = new Set([ID])
    const attempts = new Map<string, number>()
    const body = bodyAt(ARRIVAL_CAPTURE_HALF_WIDTH + 0.01, BASIN_SOUTH_Z)
    expect(shouldReportArrival(ID, body, fallingIds, attempts, 1)).toBe(false)
  })

  it('accepts an airborne marble just outside the floor-level rail corridor', () => {
    const fallingIds = new Set([ID])
    const attempts = new Map<string, number>()
    const body = bodyAt(BASIN_HOLD_CORRIDOR_HALF_WIDTH + 0.2, BASIN_SOUTH_Z)
    expect(shouldReportArrival(ID, body, fallingIds, attempts, 1)).toBe(true)
  })

  it('accepts a marble resting against the backstop inside the rail corridor', () => {
    const fallingIds = new Set([ID])
    const attempts = new Map<string, number>()
    const body = bodyAt(BASIN_HOLD_CORRIDOR_HALF_WIDTH - 0.01, BASIN_HOLD_LINE_Z - 0.05)
    expect(shouldReportArrival(ID, body, fallingIds, attempts, 1)).toBe(true)
  })

  it('throttles back-to-back attempts and re-allows after the cooldown', () => {
    const fallingIds = new Set([ID])
    const attempts = new Map<string, number>()
    const body = bodyAt(0, BASIN_SOUTH_Z + 0.05)

    expect(shouldReportArrival(ID, body, fallingIds, attempts, 0)).toBe(true)
    attempts.set(ID, 0)

    expect(shouldReportArrival(ID, body, fallingIds, attempts, ARRIVAL_RETRY_COOLDOWN / 2)).toBe(false)
    expect(shouldReportArrival(ID, body, fallingIds, attempts, ARRIVAL_RETRY_COOLDOWN)).toBe(true)
  })

  it('stops reporting once the engine accepts the marble (removed from falling ids)', () => {
    const fallingIds = new Set<string>()
    const attempts = new Map<string, number>([[ID, 0]])
    const body = bodyAt(0, BASIN_SOUTH_Z + 0.05)
    expect(shouldReportArrival(ID, body, fallingIds, attempts, 10)).toBe(false)
  })
})

describe('physics rail / arrival gate invariant', () => {
  it('places rails so a marble pressed against them sits exactly at the gate X limit', () => {
    const WALL_THICKNESS = 0.12
    const expectedRailCenterX = BASIN_HOLD_CORRIDOR_HALF_WIDTH + MARBLE_RADIUS + WALL_THICKNESS / 2

    const physics = createPhysicsWorld()
    const offsets = physics.containerBody.shapeOffsets
    const matches = offsets.filter((offset) =>
      Math.abs(Math.abs(offset.x) - expectedRailCenterX) < 1e-6,
    )
    expect(matches).toHaveLength(2)
    const xs = matches.map((offset) => offset.x).sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(-expectedRailCenterX)
    expect(xs[1]).toBeCloseTo(expectedRailCenterX)

    const reachableMarbleCenterX = expectedRailCenterX - WALL_THICKNESS / 2 - MARBLE_RADIUS
    expect(reachableMarbleCenterX).toBeCloseTo(BASIN_HOLD_CORRIDOR_HALF_WIDTH)
  })

  it('reports every marble from the first popped level-one box before any can escape', () => {
    const state = startGameFromProgress({
      highScore: 0,
      level: 1,
      powerUps: { extraBelt: 0, magnet: 0, shuffle: 0 },
      totalScore: 0,
      version: 1,
    })
    const box = state.boxes.find((candidate) => isBoxOpenable(candidate, state.boxes))
    if (!box) {
      throw new Error('Expected level one to have an openable box.')
    }
    const opened = openBox(state, box.id)
    expect(opened.fallingMarbles).toHaveLength(BOX_MARBLE_COUNT)

    const physics = createPhysicsWorld()
    const fallingIds = new Set(opened.fallingMarbles.map((marble) => marble.id))
    const attempts = new Map<string, number>()
    const bodies = new Map(opened.fallingMarbles.map((marble, index) => [
      marble.id,
      spawnMarbleBody(
        physics.world,
        physics.marbleMaterial,
        gridCellPosition(marble.from),
        index,
      ),
    ]))
    const reported = new Set<string>()

    for (let step = 0; step < 360 && reported.size < BOX_MARBLE_COUNT; step += 1) {
      const now = step / 60
      stepPhysics(physics.world, 1 / 60)

      for (const [id, body] of Array.from(bodies.entries())) {
        if (!shouldReportArrival(id, body, fallingIds, attempts, now, 0)) {
          continue
        }

        reported.add(id)
        fallingIds.delete(id)
        physics.world.removeBody(body)
        bodies.delete(id)
      }
    }

    disposePhysicsWorld(physics)

    expect(reported.size).toBe(BOX_MARBLE_COUNT)
  })
})
