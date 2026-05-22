import * as THREE from 'three'

import type { GameState } from '../gameEngine'
import {
  BOARD_CENTER_X,
  BOARD_CENTER_Y,
  CELL_SIZE,
  FIELD_Z,
  PARKING_Z,
  QUEUE_Z,
} from './sceneConstants'
import {
  feederCurve,
  fieldPositionForCar,
  parkingSlotPosition,
  queueLayoutForState,
} from './sceneGeometry'
import type { MovingCarRenderItem } from './sceneTypes'

export interface SceneFitBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface FitCameraOptions {
  camera: THREE.PerspectiveCamera
  width: number
  height: number
  bounds: SceneFitBounds
  topPaddingPx?: number
  bottomPaddingPx?: number
  sidePaddingPx?: number
}

const CAMERA_FOV_DEGREES = 42
const CAMERA_NEAR = 0.1
const CAMERA_FAR = 200
const FEEDER_CURVE_SAMPLES = 8
const BOUNDS_PADDING = CELL_SIZE * 1.2
const FIT_MIN_DISTANCE = 1
const FIT_MAX_DISTANCE = 120
const FIT_ITERATIONS = 24

// Match the legacy "look down and forward" view angle: camera previously sat at
// (0, 21, 5.4) looking toward (0, 0, -3.6), which gives a delta of (0, -21, -9).
const LOOK_DIRECTION = new THREE.Vector3(0, -21, -9).normalize()

export function gameplayBoundsForState(state: GameState, movingCars: MovingCarRenderItem[]): SceneFitBounds {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  const include = (x: number, z: number): void => {
    if (x < minX) {
      minX = x
    }
    if (x > maxX) {
      maxX = x
    }
    if (z < minZ) {
      minZ = z
    }
    if (z > maxZ) {
      maxZ = z
    }
  }

  const boardLeft = (0 - BOARD_CENTER_X) * CELL_SIZE
  const boardRight = (state.boardWidth - 1 - BOARD_CENTER_X) * CELL_SIZE
  const boardTop = FIELD_Z + (0 - BOARD_CENTER_Y) * CELL_SIZE
  const boardBottom = FIELD_Z + (state.boardHeight - 1 - BOARD_CENTER_Y) * CELL_SIZE
  include(boardLeft, boardTop)
  include(boardRight, boardBottom)

  for (const car of state.cars) {
    if (car.status === 'field') {
      const position = fieldPositionForCar(car)
      include(position.x, position.z)
    }
  }

  for (const slot of state.parkingSlots) {
    if (!slot.unlocked) {
      continue
    }
    const position = parkingSlotPosition(slot.index, slot.kind)
    include(position.x, position.z)
  }
  // Ensure the full parking row depth is visible even if all slots are stacked at one z.
  include(0, PARKING_Z)

  const layout = queueLayoutForState(state)
  const queueHalfWidth = layout.halfWidth + layout.capRadius
  include(-queueHalfWidth, QUEUE_Z - layout.capRadius)
  include(queueHalfWidth, QUEUE_Z + layout.capRadius)

  for (const side of [-1, 1] as const) {
    const curve = feederCurve(side, layout)
    for (let i = 0; i <= FEEDER_CURVE_SAMPLES; i += 1) {
      const t = i / FEEDER_CURVE_SAMPLES
      const point = curve.getPointAt(t)
      include(point.x, point.z)
    }
  }

  for (const moving of movingCars) {
    // Departure routes intentionally exit the playfield. Including their offscreen
    // endpoints would pull the camera target sideways and shrink the visible area
    // mid-animation, so only the car's current visible position participates.
    if (moving.movementKind === 'departure') {
      include(moving.mesh.position.x, moving.mesh.position.z)
      continue
    }
    for (const point of moving.route) {
      include(point.position.x, point.position.z)
    }
  }

  return {
    minX: minX - BOUNDS_PADDING,
    maxX: maxX + BOUNDS_PADDING,
    minZ: minZ - BOUNDS_PADDING,
    maxZ: maxZ + BOUNDS_PADDING,
  }
}

export function fitCameraToGameplayBounds({
  camera,
  width,
  height,
  bounds,
  topPaddingPx = 16,
  bottomPaddingPx = 88,
  sidePaddingPx = 16,
}: FitCameraOptions): void {
  camera.fov = CAMERA_FOV_DEGREES
  camera.aspect = width / height
  camera.near = CAMERA_NEAR
  camera.far = CAMERA_FAR

  const target = new THREE.Vector3(
    (bounds.minX + bounds.maxX) / 2,
    0,
    (bounds.minZ + bounds.maxZ) / 2,
  )

  const sidePadNdc = clampNdcPadding(sidePaddingPx, width)
  const topPadNdc = clampNdcPadding(topPaddingPx, height)
  const bottomPadNdc = clampNdcPadding(bottomPaddingPx, height)
  const ndcXMin = -1 + sidePadNdc
  const ndcXMax = 1 - sidePadNdc
  const ndcYMin = -1 + bottomPadNdc
  const ndcYMax = 1 - topPadNdc

  const corners: THREE.Vector3[] = [
    new THREE.Vector3(bounds.minX, 0, bounds.minZ),
    new THREE.Vector3(bounds.maxX, 0, bounds.minZ),
    new THREE.Vector3(bounds.minX, 0, bounds.maxZ),
    new THREE.Vector3(bounds.maxX, 0, bounds.maxZ),
  ]

  const projected = new THREE.Vector3()
  const offset = new THREE.Vector3()

  const apply = (distance: number): void => {
    offset.copy(LOOK_DIRECTION).multiplyScalar(-distance)
    camera.position.copy(target).add(offset)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
  }

  const fits = (distance: number): boolean => {
    apply(distance)
    for (const corner of corners) {
      projected.copy(corner).project(camera)
      if (
        !Number.isFinite(projected.x) ||
        !Number.isFinite(projected.y) ||
        projected.x < ndcXMin ||
        projected.x > ndcXMax ||
        projected.y < ndcYMin ||
        projected.y > ndcYMax
      ) {
        return false
      }
    }

    return true
  }

  if (!fits(FIT_MAX_DISTANCE)) {
    // Bounds are too large to fit even at maximum distance; settle on the
    // furthest distance to minimise clipping rather than locking up.
    apply(FIT_MAX_DISTANCE)

    return
  }

  let low = FIT_MIN_DISTANCE
  let high = FIT_MAX_DISTANCE
  if (fits(low)) {
    apply(low)

    return
  }

  for (let i = 0; i < FIT_ITERATIONS; i += 1) {
    const mid = (low + high) / 2
    if (fits(mid)) {
      high = mid
    } else {
      low = mid
    }
  }

  apply(high)
}

function clampNdcPadding(paddingPx: number, sizePx: number): number {
  if (sizePx <= 0) {
    return 0
  }
  const ndc = (paddingPx / sizePx) * 2

  return Math.max(0, Math.min(1.8, ndc))
}
