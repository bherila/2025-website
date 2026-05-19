import type * as THREE from 'three'

import type { Car, GameState } from '../../gameEngine'
import { BLOCKED_BOUNCE_DURATION } from '../sceneConstants'
import { createBlockedRoute, routeSegmentLengths } from '../sceneGeometry'
import type { MovingCarRenderItem } from '../sceneTypes'

export function startBlockedCarAnimation(car: Car, state: GameState, mesh: THREE.Group, movingCars: MovingCarRenderItem[]): void {
  const route = createBlockedRoute(car, state)
  const segmentLengths = routeSegmentLengths(route)
  const totalLength = segmentLengths.reduce((total, length) => total + length, 0)
  movingCars.push({
    carId: car.id,
    movementKind: 'blocked',
    mesh,
    route,
    segmentLengths,
    totalLength,
    startedAt: performance.now() / 1000,
    duration: BLOCKED_BOUNCE_DURATION,
  })
}
