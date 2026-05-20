import * as CANNON from 'cannon-es'

import {
  BASIN_EXIT_HALF_WIDTH,
  BASIN_FLOOR_Y,
  BASIN_NORTH_Z,
  BASIN_SOUTH_Z,
  BASIN_TOP_HALF_WIDTH,
  MARBLE_RADIUS,
} from '../sceneConstants'

export interface PhysicsWorld {
  world: CANNON.World
  marbleMaterial: CANNON.Material
  containerBody: CANNON.Body
}

const WALL_HEIGHT = 0.6
const WALL_THICKNESS = 0.12

export function createPhysicsWorld(): PhysicsWorld {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -2.6, 4.6) })
  world.broadphase = new CANNON.NaiveBroadphase()
  world.allowSleep = true

  const marbleMaterial = new CANNON.Material('marble')
  const wallMaterial = new CANNON.Material('wall')
  world.addContactMaterial(new CANNON.ContactMaterial(marbleMaterial, wallMaterial, {
    friction: 0.16,
    restitution: 0.08,
  }))
  world.addContactMaterial(new CANNON.ContactMaterial(marbleMaterial, marbleMaterial, {
    friction: 0.08,
    restitution: 0.04,
  }))

  const containerBody = new CANNON.Body({ mass: 0, material: wallMaterial })

  containerBody.addShape(
    new CANNON.Plane(),
    new CANNON.Vec3(0, BASIN_FLOOR_Y - MARBLE_RADIUS, (BASIN_NORTH_Z + BASIN_SOUTH_Z) / 2),
    new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2),
  )

  addAngledWall(containerBody, 'left')
  addAngledWall(containerBody, 'right')

  containerBody.addShape(
    new CANNON.Box(new CANNON.Vec3(BASIN_TOP_HALF_WIDTH + 0.3, WALL_HEIGHT / 2, WALL_THICKNESS / 2)),
    new CANNON.Vec3(0, BASIN_FLOOR_Y + WALL_HEIGHT / 2, BASIN_NORTH_Z - WALL_THICKNESS),
  )

  containerBody.addShape(
    new CANNON.Box(new CANNON.Vec3((BASIN_TOP_HALF_WIDTH - BASIN_EXIT_HALF_WIDTH) / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2)),
    new CANNON.Vec3(
      -(BASIN_EXIT_HALF_WIDTH + (BASIN_TOP_HALF_WIDTH - BASIN_EXIT_HALF_WIDTH) / 2),
      BASIN_FLOOR_Y + WALL_HEIGHT / 2,
      BASIN_SOUTH_Z + WALL_THICKNESS,
    ),
  )
  containerBody.addShape(
    new CANNON.Box(new CANNON.Vec3((BASIN_TOP_HALF_WIDTH - BASIN_EXIT_HALF_WIDTH) / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2)),
    new CANNON.Vec3(
      BASIN_EXIT_HALF_WIDTH + (BASIN_TOP_HALF_WIDTH - BASIN_EXIT_HALF_WIDTH) / 2,
      BASIN_FLOOR_Y + WALL_HEIGHT / 2,
      BASIN_SOUTH_Z + WALL_THICKNESS,
    ),
  )

  world.addBody(containerBody)

  return { world, marbleMaterial, containerBody }
}

function addAngledWall(body: CANNON.Body, side: 'left' | 'right'): void {
  const sign = side === 'left' ? -1 : 1
  const topX = sign * BASIN_TOP_HALF_WIDTH
  const bottomX = sign * BASIN_EXIT_HALF_WIDTH
  const dx = bottomX - topX
  const dz = BASIN_SOUTH_Z - BASIN_NORTH_Z
  const length = Math.sqrt(dx * dx + dz * dz)
  const angle = Math.atan2(dx, dz)
  const centerX = (topX + bottomX) / 2
  const centerZ = (BASIN_NORTH_Z + BASIN_SOUTH_Z) / 2

  body.addShape(
    new CANNON.Box(new CANNON.Vec3(WALL_THICKNESS / 2, WALL_HEIGHT / 2, length / 2)),
    new CANNON.Vec3(centerX - sign * WALL_THICKNESS / 2, BASIN_FLOOR_Y + WALL_HEIGHT / 2, centerZ),
    new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -angle),
  )
}

export function spawnMarbleBody(
  world: CANNON.World,
  material: CANNON.Material,
  position: { x: number, y: number, z: number },
  index: number,
): CANNON.Body {
  const body = new CANNON.Body({
    mass: 0.05,
    material,
    shape: new CANNON.Sphere(MARBLE_RADIUS),
    linearDamping: 0.1,
    angularDamping: 0.4,
    allowSleep: true,
    sleepSpeedLimit: 0.08,
    sleepTimeLimit: 0.6,
  })
  const burstOffset = index % 9
  const lateralJitter = (Math.random() - 0.5) * 0.06
  body.position.set(position.x + lateralJitter, position.y + 0.46, position.z + 0.05)
  body.velocity.set(
    (Math.random() - 0.5) * 0.18,
    -0.16 - burstOffset * 0.015,
    0.28 + Math.random() * 0.18,
  )
  body.angularVelocity.set(
    (Math.random() - 0.5) * 0.8,
    (Math.random() - 0.5) * 0.8,
    (Math.random() - 0.5) * 0.8,
  )
  world.addBody(body)

  return body
}

export function stepPhysics(world: CANNON.World, dt: number): void {
  const clamped = Math.min(dt, 0.05)
  world.step(1 / 60, clamped, 3)
}

export function disposePhysicsWorld(physics: PhysicsWorld): void {
  while (physics.world.bodies.length > 0) {
    const body = physics.world.bodies[0]
    if (!body) {
      break
    }
    physics.world.removeBody(body)
  }
}
