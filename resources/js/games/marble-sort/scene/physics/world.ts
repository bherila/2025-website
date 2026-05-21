import * as CANNON from 'cannon-es'

import {
  BASIN_EXIT_HALF_WIDTH,
  BASIN_FLOOR_Y,
  BASIN_HOLD_CORRIDOR_HALF_WIDTH,
  BASIN_HOLD_LINE_Z,
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
const FLOOR_THICKNESS = 0.2
const CHANNEL_NORTH_Z = -3.2
const FLOOR_TOP_Y = BASIN_FLOOR_Y - MARBLE_RADIUS
const WALL_CENTER_Y = FLOOR_TOP_Y + WALL_HEIGHT / 2

export function createPhysicsWorld(): PhysicsWorld {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -2.6, 6.2) })
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

  // Finite floor box spanning the whole pen from the north channel end down to
  // the holding line south of the throat. Top surface sits at BASIN_FLOOR_Y -
  // MARBLE_RADIUS so marbles rest at BASIN_FLOOR_Y, unchanged.
  const floorDepth = BASIN_HOLD_LINE_Z - CHANNEL_NORTH_Z
  const floorMidZ = (CHANNEL_NORTH_Z + BASIN_HOLD_LINE_Z) / 2
  containerBody.addShape(
    new CANNON.Box(new CANNON.Vec3(BASIN_TOP_HALF_WIDTH + 0.3, FLOOR_THICKNESS / 2, floorDepth / 2)),
    new CANNON.Vec3(0, BASIN_FLOOR_Y - MARBLE_RADIUS - FLOOR_THICKNESS / 2, floorMidZ),
  )

  addAngledWall(containerBody, 'left')
  addAngledWall(containerBody, 'right')

  // Lateral channel walls north of the basin so marbles dropped anywhere in the
  // grid stay bound in X while they slide south toward the funnel mouth.
  const channelLength = BASIN_NORTH_Z - CHANNEL_NORTH_Z
  const channelCenterZ = (CHANNEL_NORTH_Z + BASIN_NORTH_Z) / 2
  containerBody.addShape(
    new CANNON.Box(new CANNON.Vec3(WALL_THICKNESS / 2, WALL_HEIGHT / 2, channelLength / 2)),
    new CANNON.Vec3(-BASIN_TOP_HALF_WIDTH, WALL_CENTER_Y, channelCenterZ),
  )
  containerBody.addShape(
    new CANNON.Box(new CANNON.Vec3(WALL_THICKNESS / 2, WALL_HEIGHT / 2, channelLength / 2)),
    new CANNON.Vec3(BASIN_TOP_HALF_WIDTH, WALL_CENTER_Y, channelCenterZ),
  )

  // North end wall sits at the very top of the channel (well above the grid)
  // so any northward bounce is contained.
  containerBody.addShape(
    new CANNON.Box(new CANNON.Vec3(BASIN_TOP_HALF_WIDTH + 0.3, WALL_HEIGHT / 2, WALL_THICKNESS / 2)),
    new CANNON.Vec3(0, WALL_CENTER_Y, CHANNEL_NORTH_Z - WALL_THICKNESS / 2),
  )

  // Outer south side-walls flanking the throat: prevent marbles from squeezing
  // out east/west of the funnel exit.
  containerBody.addShape(
    new CANNON.Box(new CANNON.Vec3((BASIN_TOP_HALF_WIDTH - BASIN_EXIT_HALF_WIDTH) / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2)),
    new CANNON.Vec3(
      -(BASIN_EXIT_HALF_WIDTH + (BASIN_TOP_HALF_WIDTH - BASIN_EXIT_HALF_WIDTH) / 2),
      WALL_CENTER_Y,
      BASIN_SOUTH_Z + WALL_THICKNESS,
    ),
  )
  containerBody.addShape(
    new CANNON.Box(new CANNON.Vec3((BASIN_TOP_HALF_WIDTH - BASIN_EXIT_HALF_WIDTH) / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2)),
    new CANNON.Vec3(
      BASIN_EXIT_HALF_WIDTH + (BASIN_TOP_HALF_WIDTH - BASIN_EXIT_HALF_WIDTH) / 2,
      WALL_CENTER_Y,
      BASIN_SOUTH_Z + WALL_THICKNESS,
    ),
  )

  // Side rails between the throat and the backstop. The rail's inner face
  // sits one MARBLE_RADIUS outside BASIN_HOLD_CORRIDOR_HALF_WIDTH, so a marble
  // pressed against the rail has its center exactly at the gate's X limit.
  const railCenterX = BASIN_HOLD_CORRIDOR_HALF_WIDTH + MARBLE_RADIUS + WALL_THICKNESS / 2
  const corridorDepth = BASIN_HOLD_LINE_Z - BASIN_SOUTH_Z
  const corridorCenterZ = (BASIN_SOUTH_Z + BASIN_HOLD_LINE_Z) / 2
  containerBody.addShape(
    new CANNON.Box(new CANNON.Vec3(WALL_THICKNESS / 2, WALL_HEIGHT / 2, corridorDepth / 2)),
    new CANNON.Vec3(-railCenterX, WALL_CENTER_Y, corridorCenterZ),
  )
  containerBody.addShape(
    new CANNON.Box(new CANNON.Vec3(WALL_THICKNESS / 2, WALL_HEIGHT / 2, corridorDepth / 2)),
    new CANNON.Vec3(railCenterX, WALL_CENTER_Y, corridorCenterZ),
  )

  // South backstop wall: stops a marble that crosses the throat when the
  // conveyor is full. The marble waits here until the throttled arrival retry
  // in MarbleSortScene succeeds.
  containerBody.addShape(
    new CANNON.Box(new CANNON.Vec3(BASIN_TOP_HALF_WIDTH + 0.3, WALL_HEIGHT / 2, WALL_THICKNESS / 2)),
    new CANNON.Vec3(0, WALL_CENTER_Y, BASIN_HOLD_LINE_Z),
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
  // Rotation that takes the box's local +Z axis to the diagonal direction
  // (dx, dz). Using +angle (not -angle) keeps the wide endpoint at NORTH_Z
  // and the narrow endpoint at SOUTH_Z so the funnel actually funnels inward.
  const angle = Math.atan2(dx, dz)
  // Center the wall axis exactly on the funnel diagonal. The wall extends
  // ±WALL_THICKNESS/2 perpendicular to the diagonal, so its inner face sits
  // slightly inside the diagonal and its outer face slightly outside.
  const centerX = (topX + bottomX) / 2
  const centerZ = (BASIN_NORTH_Z + BASIN_SOUTH_Z) / 2

  body.addShape(
    new CANNON.Box(new CANNON.Vec3(WALL_THICKNESS / 2, WALL_HEIGHT / 2, length / 2)),
    new CANNON.Vec3(centerX, WALL_CENTER_Y, centerZ),
    new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle),
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
  const releaseIndex = index % 9
  const column = releaseIndex % 3
  const row = Math.floor(releaseIndex / 3)
  const stagger = releaseIndex / 9
  body.position.set(
    position.x + (column - 1) * 0.07,
    position.y + 0.34 + stagger * 0.08,
    position.z - 0.05 + (row - 1) * 0.06,
  )
  body.velocity.set(
    (column - 1) * 0.04,
    -0.06,
    0.45,
  )
  body.angularVelocity.set(
    (column - 1) * 0.3,
    0.08,
    (1 - column) * 0.22,
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
