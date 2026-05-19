import * as THREE from 'three'

import { PARKED_ROTATION } from '../sceneConstants'
import { angleLerp } from '../sceneGeometry'
import type { MovingCarRenderItem, PersistentMovingCarCandidate, RoutePoint } from '../sceneTypes'
import { disposeObject } from '../threeUtils'

export function animateMovingCars(cars: MovingCarRenderItem[], elapsed: number): void {
  for (let index = cars.length - 1; index >= 0; index -= 1) {
    const car = cars[index]
    if (!car) {
      continue
    }

    const progress = Math.min(1, Math.max(0, (elapsed - car.startedAt) / car.duration))
    const eased = 1 - Math.pow(1 - progress, 3)
    const routed = positionOnRoute(car, eased)
    car.mesh.position.copy(routed.position)
    car.mesh.position.y = routed.position.y + Math.sin(progress * Math.PI) * 0.18
    car.mesh.rotation.y = routed.rotationY

    if (progress >= 1) {
      if (car.removeOnComplete) {
        car.mesh.parent?.remove(car.mesh)
        disposeObject(car.mesh)
      }
      cars.splice(index, 1)
    }
  }
}

export function positionOnRoute(car: MovingCarRenderItem, progress: number): RoutePoint {
  const firstPoint = car.route[0]
  const finalPoint = car.route[car.route.length - 1]
  if (!firstPoint || !finalPoint || car.totalLength <= 0) {
    return finalPoint ?? firstPoint ?? {
      position: new THREE.Vector3(),
      rotationY: PARKED_ROTATION,
    }
  }

  const targetDistance = progress * car.totalLength
  let traveled = 0
  for (let index = 0; index < car.segmentLengths.length; index += 1) {
    const segmentLength = car.segmentLengths[index] ?? 0
    const start = car.route[index]
    const end = car.route[index + 1]
    if (!start || !end) {
      continue
    }

    if (targetDistance <= traveled + segmentLength || index === car.segmentLengths.length - 1) {
      const segmentProgress = segmentLength <= 0 ? 1 : (targetDistance - traveled) / segmentLength
      const position = new THREE.Vector3().lerpVectors(start.position, end.position, Math.min(1, Math.max(0, segmentProgress)))
      const rotationY = routeRotationAtSegment(car.route, index, Math.min(1, Math.max(0, segmentProgress)))

      return { position, rotationY }
    }

    traveled += segmentLength
  }

  return finalPoint
}

export function routeRotationAtSegment(route: RoutePoint[], index: number, segmentProgress: number): number {
  const start = route[index]
  const end = route[index + 1]
  if (!start || !end) {
    return PARKED_ROTATION
  }

  if (Math.abs(start.rotationY - end.rotationY) < 0.001) {
    return start.rotationY
  }

  const segmentRotation = rotationBetween(start.position, end.position)
  const previous = route[index - 1]
  const next = route[index + 2]
  const turnWindow = 0.18

  if (previous && segmentProgress < turnWindow) {
    const previousRotation = rotationBetween(previous.position, start.position)

    return angleLerp(previousRotation, segmentRotation, smoothStep(segmentProgress / turnWindow))
  }

  if (next && segmentProgress > 1 - turnWindow) {
    const nextRotation = rotationBetween(end.position, next.position)

    return angleLerp(segmentRotation, nextRotation, smoothStep((segmentProgress - (1 - turnWindow)) / turnWindow))
  }

  if (!next && segmentProgress > 0.72) {
    return angleLerp(segmentRotation, end.rotationY, smoothStep((segmentProgress - 0.72) / 0.28))
  }

  return segmentRotation
}

export function rotationBetween(from: THREE.Vector3, to: THREE.Vector3): number {
  const deltaX = to.x - from.x
  const deltaZ = to.z - from.z
  if (Math.abs(deltaX) < 0.001 && Math.abs(deltaZ) < 0.001) {
    return PARKED_ROTATION
  }

  return Math.atan2(deltaX, deltaZ)
}

export function smoothStep(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress))

  return clamped * clamped * (3 - 2 * clamped)
}

export function retainPersistentMovingCars<T extends PersistentMovingCarCandidate>(cars: T[], effects: THREE.Group): T[] {
  return cars.filter((car) => car.removeOnComplete === true && car.mesh.parent === effects)
}
