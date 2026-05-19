import * as THREE from 'three'

import { blockingCellKeys, type Car, type Direction, type GameState, getCarCells, gridCellKey, loopPassengerCapacity, type Passenger } from '../gameEngine'
import {
  BOARD_CENTER_X,
  BOARD_CENTER_Y,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CELL_SIZE,
  FIELD_Z,
  INCOMING_LANE_Z,
  OUTGOING_LANE_Z,
  PARKED_ROTATION,
  PARKING_Z,
  QUEUE_Z,
} from './sceneConstants'
import { type QueueLayout, type RoutePoint } from './sceneTypes'

export function passengerGateCycle(phase: number, offset: number, layout: QueueLayout): number {
  return Math.floor((phase + offset) / layout.perimeter)
}

export function passengerGateProgress(phase: number, offset: number, layout: QueueLayout): number {
  return (((phase + offset) % layout.perimeter) + layout.perimeter) % layout.perimeter
}

const FEEDER_ROW_SPACING = 0.34

export function feederPassengerPosition(passenger: Passenger, feederPassengers: Passenger[], layout: QueueLayout): THREE.Vector3 {
  const side: -1 | 1 = passenger.feederSide === 'right' ? 1 : -1
  let row = 0
  for (const candidate of feederPassengers) {
    if (candidate.id === passenger.id) {
      break
    }
    if (candidate.feederSide === passenger.feederSide) {
      row += 1
    }
  }
  const curve = feederCurve(side, layout)
  const length = curve.getLength()
  const distanceFromLoop = Math.min(length - 0.05, 0.42 + row * FEEDER_ROW_SPACING)
  const t = Math.min(1, distanceFromLoop / Math.max(0.01, length))
  const point = curve.getPointAt(t)
  point.y = 0

  return point
}

export function feederCurve(side: -1 | 1, layout: QueueLayout): THREE.CubicBezierCurve3 {
  const sign: number = side
  const halfStraight = layout.halfWidth
  const r = layout.capRadius
  const innerX = sign * (halfStraight + r * 0.74)
  const innerZ = QUEUE_Z - r * 0.74 - 0.12
  const outerX = sign * (halfStraight + r + 1.55)
  const outerZ = QUEUE_Z - r - 4.0
  const cp1x = sign * (halfStraight + r * 1.05)
  const cp1z = QUEUE_Z - r - 1.4
  const cp2x = sign * (halfStraight + r + 1.45)
  const cp2z = QUEUE_Z - r - 2.7

  return new THREE.CubicBezierCurve3(
    new THREE.Vector3(innerX, 0, innerZ),
    new THREE.Vector3(cp1x, 0, cp1z),
    new THREE.Vector3(cp2x, 0, cp2z),
    new THREE.Vector3(outerX, 0, outerZ),
  )
}

export function queuePosition(rawDistance: number, layout: QueueLayout): THREE.Vector3 {
  const distance = (((boardingGateDistance(layout) + rawDistance) % layout.perimeter) + layout.perimeter) % layout.perimeter
  const halfStraight = layout.straightLength / 2
  const capArcLength = Math.PI * layout.capRadius
  const afterTopStraight = layout.straightLength
  const afterRightCap = afterTopStraight + capArcLength
  const afterBottomStraight = afterRightCap + layout.straightLength

  if (distance < afterTopStraight) {
    return new THREE.Vector3(-halfStraight + distance, 0, QUEUE_Z - layout.capRadius)
  }

  if (distance < afterRightCap) {
    const angle = (distance - afterTopStraight) / layout.capRadius - Math.PI / 2

    return new THREE.Vector3(halfStraight + Math.cos(angle) * layout.capRadius, 0, QUEUE_Z + Math.sin(angle) * layout.capRadius)
  }

  if (distance < afterBottomStraight) {
    return new THREE.Vector3(halfStraight - (distance - afterRightCap), 0, QUEUE_Z + layout.capRadius)
  }

  const angle = (distance - afterBottomStraight) / layout.capRadius + Math.PI / 2

  return new THREE.Vector3(-halfStraight + Math.cos(angle) * layout.capRadius, 0, QUEUE_Z + Math.sin(angle) * layout.capRadius)
}

export function queueLayoutForState(state: GameState): QueueLayout {
  const activeCount = Math.max(1, loopPassengerCapacity(state))
  const targetPerimeter = Math.max(3.0, activeCount * passengerSpacing())
  const capRadius = Math.max(0.78, Math.min(1.45, targetPerimeter / 11.0))
  const straightLength = Math.max(0.6, (targetPerimeter - Math.PI * 2 * capRadius) / 2)
  const perimeter = straightLength * 2 + Math.PI * 2 * capRadius
  const width = straightLength + capRadius * 2 + 0.7
  const depth = capRadius * 2 + 0.7

  return {
    width,
    depth,
    straightLength,
    capRadius,
    perimeter,
    halfWidth: straightLength / 2,
    halfDepth: capRadius,
  }
}

export function passengerSpacing(): number {
  return 0.34
}

export function createParkingRoute(car: Car, target: THREE.Vector3): RoutePoint[] {
  const start = fieldPositionForCar(car)
  const exit = boardExitPosition(car)
  const boardBounds = boardBoundsForRoute()
  const routePositions = [start, exit]

  if (car.direction === 'down') {
    const sideX = target.x < 0 ? boardBounds.left : boardBounds.right
    routePositions.push(
      new THREE.Vector3(sideX, start.y, boardBounds.bottom),
      new THREE.Vector3(sideX, start.y, INCOMING_LANE_Z),
    )
  } else if (car.direction === 'left' || car.direction === 'right') {
    routePositions.push(new THREE.Vector3(exit.x, start.y, INCOMING_LANE_Z))
  }

  routePositions.push(
    new THREE.Vector3(target.x, start.y, INCOMING_LANE_Z),
    new THREE.Vector3(target.x, target.y, target.z),
  )

  return routePositionsToRoutePoints(routePositions)
}

export function createBlockedRoute(car: Car, state: GameState): RoutePoint[] {
  const start = fieldPositionForCar(car)
  const rotationY = rotationForDirection(car.direction)
  const travelDistance = blockedTravelDistance(car, state)
  const direction = worldDirectionForCar(car.direction)
  const collision = start.clone().add(direction.multiplyScalar(travelDistance))

  return [
    { position: start, rotationY },
    { position: collision, rotationY },
    { position: start, rotationY },
  ]
}

export function createDepartureRoute(start: THREE.Vector3): RoutePoint[] {
  const backOut = new THREE.Vector3(start.x, start.y, OUTGOING_LANE_Z)
  const exit = new THREE.Vector3(13.5, start.y, OUTGOING_LANE_Z)

  return [
    { position: start, rotationY: PARKED_ROTATION },
    { position: backOut, rotationY: PARKED_ROTATION },
    { position: exit, rotationY: Math.PI / 2 },
  ]
}

export function routeSegmentLengths(route: RoutePoint[]): number[] {
  const lengths: number[] = []
  for (let index = 0; index < route.length - 1; index += 1) {
    const current = route[index]
    const next = route[index + 1]
    if (current && next) {
      lengths.push(current.position.distanceTo(next.position))
    }
  }

  return lengths
}

export function fieldPositionForCar(car: Car): THREE.Vector3 {
  const cells = getCarCells(car)
  const average = cells.reduce(
    (carry, cell) => ({
      x: carry.x + cell.x,
      y: carry.y + cell.y,
    }),
    { x: 0, y: 0 },
  )
  const center = {
    x: average.x / cells.length,
    y: average.y / cells.length,
  }
  const world = gridToWorld(center.x, center.y)

  return new THREE.Vector3(world.x, 0.08, world.z)
}

export function gridToWorld(x: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(
    (x - BOARD_CENTER_X) * CELL_SIZE,
    0,
    FIELD_Z + (y - BOARD_CENTER_Y) * CELL_SIZE,
  )
}

export function parkingSlotPosition(index: number, kind: 'regular' | 'vip'): THREE.Vector3 {
  if (kind === 'vip') {
    return new THREE.Vector3(-4.5, 0.08, PARKING_Z)
  }

  return new THREE.Vector3(-3.0 + index * 1.10, 0.08, PARKING_Z)
}

export function rotationForDirection(direction: Direction): number {
  if (direction === 'right') {
    return Math.PI / 2
  }

  if (direction === 'left') {
    return -Math.PI / 2
  }

  if (direction === 'up') {
    return Math.PI
  }

  return 0
}

export function angleLerp(from: number, to: number, progress: number): number {
  const delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI

  return from + delta * progress
}

function boardingGateDistance(layout: QueueLayout): number {
  return layout.straightLength * 1.5 + Math.PI * layout.capRadius
}

function blockedTravelDistance(car: Car, state: GameState): number {
  const occupied = blockingCellKeys(state, car.id)
  const path = pathCellsToBoardEdge(car, state.boardWidth, state.boardHeight)
  const collisionIndex = path.findIndex((cell) => occupied.has(gridCellKey(cell)))

  if (collisionIndex < 0) {
    return CELL_SIZE * 0.7
  }

  return Math.max(CELL_SIZE * 0.42, (collisionIndex + 0.54) * CELL_SIZE)
}

function pathCellsToBoardEdge(car: Car, boardWidth: number, boardHeight: number): Array<{ x: number, y: number }> {
  const cells: Array<{ x: number, y: number }> = []

  if (car.direction === 'right') {
    const start = car.position.x + car.length
    for (let x = start; x < boardWidth; x += 1) {
      cells.push({ x, y: car.position.y })
    }
  }

  if (car.direction === 'left') {
    const start = car.position.x - 1
    for (let x = start; x >= 0; x -= 1) {
      cells.push({ x, y: car.position.y })
    }
  }

  if (car.direction === 'down') {
    const start = car.position.y + car.length
    for (let y = start; y < boardHeight; y += 1) {
      cells.push({ x: car.position.x, y })
    }
  }

  if (car.direction === 'up') {
    const start = car.position.y - 1
    for (let y = start; y >= 0; y -= 1) {
      cells.push({ x: car.position.x, y })
    }
  }

  return cells
}

function boardExitPosition(car: Car): THREE.Vector3 {
  const start = fieldPositionForCar(car)
  const bounds = boardBoundsForRoute()

  if (car.direction === 'right') {
    return new THREE.Vector3(bounds.right, start.y, start.z)
  }

  if (car.direction === 'left') {
    return new THREE.Vector3(bounds.left, start.y, start.z)
  }

  if (car.direction === 'down') {
    return new THREE.Vector3(start.x, start.y, bounds.bottom)
  }

  return new THREE.Vector3(start.x, start.y, bounds.top)
}

function boardBoundsForRoute(): { bottom: number, left: number, right: number, top: number } {
  return {
    left: gridToWorld(-1.05, 0).x,
    right: gridToWorld(BOARD_WIDTH + 0.05, 0).x,
    top: PARKING_Z + 1.08,
    bottom: gridToWorld(0, BOARD_HEIGHT + 0.05).z,
  }
}

function routePositionsToRoutePoints(positions: THREE.Vector3[]): RoutePoint[] {
  return positions.map((position, index) => {
    const next = positions[index + 1]
    const previous = positions[index - 1]
    const rotationSource = next ?? previous
    const rotationY = rotationSource
      ? rotationFromDelta(rotationSource.x - position.x, rotationSource.z - position.z)
      : PARKED_ROTATION

    return {
      position,
      rotationY: index === positions.length - 1 ? PARKED_ROTATION : rotationY,
    }
  })
}

function worldDirectionForCar(direction: Direction): THREE.Vector3 {
  if (direction === 'right') {
    return new THREE.Vector3(1, 0, 0)
  }

  if (direction === 'left') {
    return new THREE.Vector3(-1, 0, 0)
  }

  if (direction === 'up') {
    return new THREE.Vector3(0, 0, -1)
  }

  return new THREE.Vector3(0, 0, 1)
}

function rotationFromDelta(deltaX: number, deltaZ: number): number {
  if (Math.abs(deltaX) < 0.001 && Math.abs(deltaZ) < 0.001) {
    return PARKED_ROTATION
  }

  return Math.atan2(deltaX, deltaZ)
}
