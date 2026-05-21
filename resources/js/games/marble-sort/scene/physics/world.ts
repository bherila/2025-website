import * as CANNON from 'cannon-es'

import {
  BASIN_EXIT_HALF_WIDTH,
  BASIN_FLOOR_Y,
  BASIN_HOLD_CORRIDOR_HALF_WIDTH,
  BASIN_HOLD_LINE_Z,
  BASIN_NORTH_Z,
  BASIN_SOUTH_Z,
  BASIN_TOP_HALF_WIDTH,
  CONVEYOR_BELT_SOUTH_Z,
  MARBLE_RADIUS,
} from '../sceneConstants'

export interface PhysicsWorld {
  world: CANNON.World
  marbleMaterial: CANNON.Material
  containerBody: CANNON.Body
}

const WALL_HEIGHT = 0.6
const WALL_THICKNESS = 0.12
// Z-perpendicular walls (backstop, outer south, north end) get extra thickness
// because the marble's +Z velocity at impact can approach 0.12 per physics
// step, the same as WALL_THICKNESS — close enough to tunnel through. 0.5
// leaves a 4× safety margin even on slow frames.
const BACKSTOP_THICKNESS = 0.5
const FLOOR_THICKNESS = 0.2
const CHANNEL_NORTH_Z = -3.2
// Floor extends well south of the backstop so any tunneled marble lands on
// it instead of falling out of the world.
const FLOOR_SOUTH_Z = CONVEYOR_BELT_SOUTH_Z + 1
const FLOOR_TOP_Y = BASIN_FLOOR_Y - MARBLE_RADIUS
const WALL_CENTER_Y = FLOOR_TOP_Y + WALL_HEIGHT / 2
// Ceiling above the funnel and corridor: keeps marbles in a single layer so
// they don't pile up vertically when the conveyor is backed up. Bottom face
// sits one MARBLE_RADIUS + small clearance above the floor, leaving room for
// exactly one marble in y.
const CEILING_THICKNESS = 0.2
const CEILING_BOTTOM_Y = BASIN_FLOOR_Y + MARBLE_RADIUS + 0.08
const CEILING_CENTER_Y = CEILING_BOTTOM_Y + CEILING_THICKNESS / 2

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

  // Finite floor box covering the whole pen plus a safety extension past the
  // backstop, so a marble that somehow tunnels through the backstop still
  // lands on a floor and can't fall out of the world.
  const floorDepth = FLOOR_SOUTH_Z - CHANNEL_NORTH_Z
  const floorMidZ = (CHANNEL_NORTH_Z + FLOOR_SOUTH_Z) / 2
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

  // Side rails from the throat all the way to the floor's south edge so the
  // marble corridor is bounded east-west everywhere a marble can physically
  // be. They extend past the backstop so any marble that tunnels through it
  // is still confined to the arrival X gate.
  const railCenterX = BASIN_HOLD_CORRIDOR_HALF_WIDTH + MARBLE_RADIUS + WALL_THICKNESS / 2
  const corridorDepth = FLOOR_SOUTH_Z - BASIN_SOUTH_Z
  const corridorCenterZ = (BASIN_SOUTH_Z + FLOOR_SOUTH_Z) / 2
  containerBody.addShape(
    new CANNON.Box(new CANNON.Vec3(WALL_THICKNESS / 2, WALL_HEIGHT / 2, corridorDepth / 2)),
    new CANNON.Vec3(-railCenterX, WALL_CENTER_Y, corridorCenterZ),
  )
  containerBody.addShape(
    new CANNON.Box(new CANNON.Vec3(WALL_THICKNESS / 2, WALL_HEIGHT / 2, corridorDepth / 2)),
    new CANNON.Vec3(railCenterX, WALL_CENTER_Y, corridorCenterZ),
  )

  // South backstop wall: stops a marble that crosses the throat when the
  // conveyor is full. Uses BACKSTOP_THICKNESS because marble vz at impact
  // (after ~1m of gravity-driven fall through the funnel + corridor) can
  // approach WALL_THICKNESS per physics step, which would tunnel a thin
  // wall.
  containerBody.addShape(
    new CANNON.Box(new CANNON.Vec3(BASIN_TOP_HALF_WIDTH + 0.3, WALL_HEIGHT / 2, BACKSTOP_THICKNESS / 2)),
    new CANNON.Vec3(0, WALL_CENTER_Y, BASIN_HOLD_LINE_Z + BACKSTOP_THICKNESS / 2),
  )

  // Ceiling over the funnel + corridor + safety floor. Forces marbles to
  // settle in a single layer when the conveyor backs up — a stacked marble
  // (center at floor + diameter) would clash with the ceiling and be pushed
  // sideways instead. Z range starts at BASIN_NORTH_Z so the grid spawn area
  // is unobstructed.
  const ceilingDepth = FLOOR_SOUTH_Z - BASIN_NORTH_Z
  const ceilingMidZ = (BASIN_NORTH_Z + FLOOR_SOUTH_Z) / 2
  containerBody.addShape(
    new CANNON.Box(new CANNON.Vec3(BASIN_TOP_HALF_WIDTH + 0.3, CEILING_THICKNESS / 2, ceilingDepth / 2)),
    new CANNON.Vec3(0, CEILING_CENTER_Y, ceilingMidZ),
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
