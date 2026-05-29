import * as THREE from 'three'

import {
  blockingCellKeys,
  type Car,
  type Direction,
  directionStep,
  type GameState,
  getCarCells,
  gridCellKey,
  loopPassengerLayoutCapacity,
  type Passenger,
  pathCellsToExit,
  pathOccupiedCellStepsToExit,
} from '../gameEngine'
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
  PARKING_SLOT_TILT,
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

export function feederJoinProgress(layout: QueueLayout): number {
  return normalizeLoopDistance(layout.straightLength / 2 - boardingGateDistance(layout), layout.perimeter)
}

const FEEDER_ROW_SPACING = 0.34
const LOOP_VISUAL_LANE_OFFSETS = [0, -0.16, 0.16] as const
const FEEDER_VISUAL_LANE_OFFSETS = [0, -0.15, 0.15] as const
const DEFAULT_DEPARTURE_OFFSCREEN_X = 22
const DEPARTURE_VIEWPORT_CLEARANCE = 3.2
const DEPARTURE_EXIT_SEARCH_LIMIT = 56

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
  const distanceFromLoop = 0.42 + row * FEEDER_ROW_SPACING
  let point: THREE.Vector3
  let tangent: THREE.Vector3
  if (distanceFromLoop <= length - 0.05) {
    const t = distanceFromLoop / Math.max(0.01, length)
    point = curve.getPointAt(t)
    tangent = curve.getTangentAt(t)
  } else {
    tangent = curve.getTangentAt(1)
    point = curve.getPointAt(1).addScaledVector(tangent, distanceFromLoop - length)
  }
  offsetPointByNormal(point, tangent, passengerFeederLaneOffset(passenger.id))
  point.y = 0

  return point
}

export function feederCurve(side: -1 | 1, layout: QueueLayout): THREE.CubicBezierCurve3 {
  const sign: number = side
  const halfStraight = layout.halfWidth
  const r = layout.capRadius
  const innerX = sign * (halfStraight + r * 0.74)
  const innerZ = QUEUE_Z - r * 0.74 - 0.12
  const outerX = sign * (halfStraight + r + 1.75)
  const outerZ = QUEUE_Z - r - 4.25
  const cp1x = sign * (halfStraight + r * 1.05)
  const cp1z = QUEUE_Z - r - 1.1
  const cp2x = sign * (halfStraight + r + 1.55)
  const cp2z = QUEUE_Z - r - 3.15

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

export function queueVisualPosition(rawDistance: number, layout: QueueLayout, laneOffset: number): THREE.Vector3 {
  const position = queuePosition(rawDistance, layout)
  if (laneOffset === 0) {
    return position
  }

  const tangent = queueTangent(rawDistance, layout)
  offsetPointByNormal(position, tangent, laneOffset)

  return position
}

export function passengerQueueLaneOffset(passengerId: string): number {
  return LOOP_VISUAL_LANE_OFFSETS[stableLaneIndex(passengerId, LOOP_VISUAL_LANE_OFFSETS.length)] ?? 0
}

export function passengerFeederLaneOffset(passengerId: string): number {
  return FEEDER_VISUAL_LANE_OFFSETS[stableLaneIndex(passengerId, FEEDER_VISUAL_LANE_OFFSETS.length)] ?? 0
}

export function queueLayoutForState(state: GameState): QueueLayout {
  const activeCount = Math.max(1, loopPassengerLayoutCapacity(state))
  return queueLayoutForPassengerCount(activeCount)
}

function queueLayoutForPassengerCount(activeCount: number): QueueLayout {
  const targetPerimeter = Math.max(3.2, activeCount * passengerSpacing())
  const capRadius = Math.max(0.48, Math.min(1.45, targetPerimeter / 8.0))
  const straightLength = Math.max(0.45, (targetPerimeter - Math.PI * 2 * capRadius) / 2)
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
  return 0.30
}

export function createParkingRoute(car: Car, target: THREE.Vector3): RoutePoint[] {
  const start = fieldPositionForCar(car)
  const exit = boardExitPosition(car)
  const boardBounds = boardBoundsForRoute()
  const routePositions = [start, exit]
  let laneEntryX = exit.x

  if (car.direction === 'down') {
    const sideX = target.x < 0 ? boardBounds.left : boardBounds.right
    laneEntryX = sideX
    routePositions.push(
      new THREE.Vector3(sideX, start.y, boardBounds.bottom),
    )
  } else if (car.direction === 'left' || car.direction === 'right') {
    laneEntryX = exit.x
  } else if (isDiagonalDirection(car.direction)) {
    const sideX = exit.x < start.x ? boardBounds.left : boardBounds.right
    laneEntryX = sideX
    routePositions.push(
      new THREE.Vector3(sideX, start.y, exit.z),
    )
  }

  const laneZ = parkingTrafficLaneZ(laneEntryX, target.x)
  const laneOffsetX = (laneZ - target.z) * Math.tan(PARKING_SLOT_TILT)
  const approachX = target.x + laneOffsetX

  routePositions.push(
    new THREE.Vector3(laneEntryX, start.y, laneZ),
    new THREE.Vector3(approachX, start.y, laneZ),
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

export function createDepartureRoute(start: THREE.Vector3, exitX = DEFAULT_DEPARTURE_OFFSCREEN_X): RoutePoint[] {
  const laneOffsetX = (OUTGOING_LANE_Z - start.z) * Math.tan(PARKING_SLOT_TILT)
  const backOut = new THREE.Vector3(start.x + laneOffsetX, start.y, OUTGOING_LANE_Z)
  const exit = new THREE.Vector3(exitX, start.y, OUTGOING_LANE_Z)

  return [
    { position: start, rotationY: PARKED_ROTATION + PARKING_SLOT_TILT },
    { position: backOut, rotationY: PARKED_ROTATION + PARKING_SLOT_TILT },
    { position: exit, rotationY: Math.PI / 2 },
  ]
}

export function departureExitXForViewport(camera: THREE.Camera | null): number {
  if (!camera) {
    return DEFAULT_DEPARTURE_OFFSCREEN_X
  }

  camera.updateMatrixWorld()
  if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
    camera.updateProjectionMatrix()
  }

  let low = 0
  let high = DEFAULT_DEPARTURE_OFFSCREEN_X
  let projected = projectedXAtDepartureLane(high, camera)
  while (Number.isFinite(projected) && projected < 1 && high < DEPARTURE_EXIT_SEARCH_LIMIT) {
    low = high
    high = Math.min(DEPARTURE_EXIT_SEARCH_LIMIT, high * 1.35)
    projected = projectedXAtDepartureLane(high, camera)
  }

  if (!Number.isFinite(projected) || projected < 1) {
    return DEPARTURE_EXIT_SEARCH_LIMIT
  }

  for (let step = 0; step < 16; step += 1) {
    const midpoint = (low + high) / 2
    if (projectedXAtDepartureLane(midpoint, camera) < 1) {
      low = midpoint
    } else {
      high = midpoint
    }
  }

  return Math.max(DEFAULT_DEPARTURE_OFFSCREEN_X, high + DEPARTURE_VIEWPORT_CLEARANCE)
}

function projectedXAtDepartureLane(x: number, camera: THREE.Camera): number {
  return new THREE.Vector3(x, 0.08, OUTGOING_LANE_Z).project(camera).x
}

function parkingTrafficLaneZ(fromX: number, toX: number): number {
  return toX >= fromX ? OUTGOING_LANE_Z : INCOMING_LANE_Z
}

function queueTangent(rawDistance: number, layout: QueueLayout): THREE.Vector3 {
  const epsilon = Math.max(0.001, Math.min(0.02, layout.perimeter / 1000))
  const before = queuePosition(rawDistance - epsilon, layout)
  const after = queuePosition(rawDistance + epsilon, layout)
  const tangent = after.sub(before)

  if (tangent.lengthSq() === 0) {
    return new THREE.Vector3(1, 0, 0)
  }

  return tangent.normalize()
}

function offsetPointByNormal(point: THREE.Vector3, tangent: THREE.Vector3, laneOffset: number): void {
  const normalX = -tangent.z
  const normalZ = tangent.x
  const normalLength = Math.hypot(normalX, normalZ)
  if (normalLength === 0) {
    return
  }

  point.x += (normalX / normalLength) * laneOffset
  point.z += (normalZ / normalLength) * laneOffset
}

function stableLaneIndex(value: string, laneCount: number): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }

  return Math.abs(hash) % laneCount
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
    return new THREE.Vector3(-4.6, 0.08, PARKING_Z)
  }

  return new THREE.Vector3(-3.0 + index * 1.18, 0.08, PARKING_Z)
}

export function rotationForDirection(direction: Direction): number {
  const step = directionStep(direction)

  return Math.atan2(step.x, step.y)
}

export function angleLerp(from: number, to: number, progress: number): number {
  const fullTurn = Math.PI * 2
  const delta = (((to - from + Math.PI) % fullTurn) + fullTurn) % fullTurn - Math.PI

  return from + delta * progress
}

function boardingGateDistance(layout: QueueLayout): number {
  return layout.straightLength * 1.5 + Math.PI * layout.capRadius
}

function normalizeLoopDistance(distance: number, perimeter: number): number {
  return ((distance % perimeter) + perimeter) % perimeter
}

function blockedTravelDistance(car: Car, state: GameState): number {
  const occupied = blockingCellKeys(state, car.id)
  const path = pathOccupiedCellStepsToExit(car, state.boardWidth, state.boardHeight)
  const collisionIndex = path.findIndex((cells) => cells.some((cell) => occupied.has(gridCellKey(cell))))

  if (collisionIndex < 0) {
    return CELL_SIZE * 0.7
  }

  return Math.max(CELL_SIZE * 0.42, (collisionIndex + 0.54) * CELL_SIZE)
}

function boardExitPosition(car: Car): THREE.Vector3 {
  const bounds = boardBoundsForRoute()
  const path = pathCellsToExit(car, BOARD_WIDTH, BOARD_HEIGHT)
  const step = directionStep(car.direction)
  const lastCell = path[path.length - 1] ?? frontCellForRoute(car)
  const exitCell = { x: lastCell.x + step.x, y: lastCell.y + step.y }
  const gridExit = gridToWorld(exitCell.x, exitCell.y)

  if (car.direction === 'right') {
    return new THREE.Vector3(bounds.right, 0.08, gridExit.z)
  }

  if (car.direction === 'left') {
    return new THREE.Vector3(bounds.left, 0.08, gridExit.z)
  }

  if (car.direction === 'down') {
    return new THREE.Vector3(gridExit.x, 0.08, bounds.bottom)
  }

  if (car.direction === 'up') {
    return new THREE.Vector3(gridExit.x, 0.08, bounds.top)
  }

  return new THREE.Vector3(
    Math.min(bounds.right, Math.max(bounds.left, gridExit.x)),
    0.08,
    Math.min(bounds.bottom, Math.max(bounds.top, gridExit.z)),
  )
}

function boardBoundsForRoute(): { bottom: number, left: number, right: number, top: number } {
  return {
    left: gridToWorld(-1.05, 0).x,
    right: gridToWorld(BOARD_WIDTH + 0.05, 0).x,
    top: PARKING_Z + 1.08,
    bottom: gridToWorld(0, BOARD_HEIGHT + 0.05).z,
  }
}

function frontCellForRoute(car: Pick<Car, 'direction' | 'length' | 'position'>): { x: number, y: number } {
  const step = directionStep(car.direction)
  const cells = getCarCells(car)
  const firstCell = cells[0]
  if (!firstCell) {
    return { ...car.position }
  }

  const front = cells.slice(1).reduce((currentFront, cell) => {
    const currentValue = currentFront.x * step.x + currentFront.y * step.y
    const nextValue = cell.x * step.x + cell.y * step.y

    return nextValue > currentValue ? cell : currentFront
  }, firstCell)

  return { ...front }
}

function isDiagonalDirection(direction: Direction): boolean {
  return direction.includes('-')
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
      rotationY: index === positions.length - 1 ? PARKED_ROTATION + PARKING_SLOT_TILT : rotationY,
    }
  })
}

function worldDirectionForCar(direction: Direction): THREE.Vector3 {
  const step = directionStep(direction)

  return new THREE.Vector3(step.x, 0, step.y).normalize()
}

function rotationFromDelta(deltaX: number, deltaZ: number): number {
  if (Math.abs(deltaX) < 0.001 && Math.abs(deltaZ) < 0.001) {
    return PARKED_ROTATION
  }

  return Math.atan2(deltaX, deltaZ)
}
