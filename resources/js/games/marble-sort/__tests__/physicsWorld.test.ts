import * as CANNON from 'cannon-es'

import { createPhysicsWorld } from '../scene/physics/world'
import {
  BASIN_EXIT_HALF_WIDTH,
  BASIN_NORTH_Z,
  BASIN_SOUTH_Z,
  BASIN_TOP_HALF_WIDTH,
} from '../scene/sceneConstants'

interface AngledWall {
  offset: CANNON.Vec3
  orientation: CANNON.Quaternion
  shape: CANNON.Box
}

function findAngledWalls(body: CANNON.Body): AngledWall[] {
  const result: AngledWall[] = []
  for (let index = 0; index < body.shapes.length; index += 1) {
    const shape = body.shapes[index]
    const orientation = body.shapeOrientations[index]
    const offset = body.shapeOffsets[index]
    if (!(shape instanceof CANNON.Box) || !orientation || !offset) {
      continue
    }
    if (Math.abs(orientation.w - 1) > 1e-6) {
      result.push({ offset, orientation, shape })
    }
  }
  return result
}

describe('addAngledWall funnel taper', () => {
  const physics = createPhysicsWorld()
  const walls = findAngledWalls(physics.containerBody)

  it('creates exactly two angled walls (left and right)', () => {
    expect(walls).toHaveLength(2)
  })

  it.each(walls.map((wall, index) => [index, wall]))(
    'wall #%i is wide at BASIN_NORTH_Z and narrow at BASIN_SOUTH_Z',
    (_index, wall) => {
      const halfLength = wall.shape.halfExtents.z
      const sign = wall.offset.x > 0 ? 1 : -1

      const localAxis = new CANNON.Vec3(0, 0, 1)
      const globalAxis = new CANNON.Vec3()
      wall.orientation.vmult(localAxis, globalAxis)

      const endA = {
        x: wall.offset.x + halfLength * globalAxis.x,
        z: wall.offset.z + halfLength * globalAxis.z,
      }
      const endB = {
        x: wall.offset.x - halfLength * globalAxis.x,
        z: wall.offset.z - halfLength * globalAxis.z,
      }
      const [north, south] = endA.z < endB.z ? [endA, endB] : [endB, endA]

      expect(north.z).toBeCloseTo(BASIN_NORTH_Z)
      expect(north.x).toBeCloseTo(sign * BASIN_TOP_HALF_WIDTH)
      expect(south.z).toBeCloseTo(BASIN_SOUTH_Z)
      expect(south.x).toBeCloseTo(sign * BASIN_EXIT_HALF_WIDTH)
      expect(Math.abs(north.x)).toBeGreaterThan(Math.abs(south.x))
    },
  )
})
