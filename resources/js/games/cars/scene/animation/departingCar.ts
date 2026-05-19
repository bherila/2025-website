import * as THREE from 'three'

import type { GameState } from '../../gameEngine'
import { createCarMesh } from '../builders/carMesh'
import { createDepartureRoute, parkingSlotPosition, routeSegmentLengths } from '../sceneGeometry'
import type { MovingCarRenderItem } from '../sceneTypes'

const DEPARTURE_ACCELERATION_WINDOW = 0.22
const DEPARTURE_SECONDS_PER_UNIT = 0.08
const MIN_DEPARTURE_DURATION = 1.05

export function startDepartingCarAnimations(
  previousState: GameState,
  state: GameState,
  effects: THREE.Group,
  movingCars: MovingCarRenderItem[],
  departureDelays: Map<string, number>,
  colorblindMode = false,
  departureExitX?: number,
): void {
  for (const previousCar of previousState.cars) {
    const currentCar = state.cars.find((candidate) => candidate.id === previousCar.id)
    if (previousCar.status !== 'parked' || currentCar?.status !== 'departed' || !previousCar.parkingSlotId) {
      continue
    }

    const slot = previousState.parkingSlots.find((candidate) => candidate.id === previousCar.parkingSlotId)
    if (!slot) {
      continue
    }

    const start = parkingSlotPosition(slot.index, slot.kind)
    const visualCar = {
      ...previousCar,
      boarded: Math.max(previousCar.boarded, currentCar?.boarded ?? previousCar.boarded),
    }
    const mesh = createCarMesh(visualCar, start, true, { colorblindMode })
    effects.add(mesh)
    const route = createDepartureRoute(start, departureExitX)
    const segmentLengths = routeSegmentLengths(route)
    const totalLength = segmentLengths.reduce((total, length) => total + length, 0)
    movingCars.push({
      carId: previousCar.id,
      movementKind: 'departure',
      mesh,
      route,
      segmentLengths,
      totalLength,
      startedAt: departureDelays.get(previousCar.id) ?? performance.now() / 1000,
      duration: Math.max(MIN_DEPARTURE_DURATION, totalLength * DEPARTURE_SECONDS_PER_UNIT),
      removeOnComplete: true,
      routeProgress: accelerateThenConstantRouteProgress,
    })
  }
}

export function accelerateThenConstantRouteProgress(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress))
  const distance = clamped < DEPARTURE_ACCELERATION_WINDOW
    ? (clamped * clamped) / (2 * DEPARTURE_ACCELERATION_WINDOW)
    : clamped - DEPARTURE_ACCELERATION_WINDOW / 2

  return distance / (1 - DEPARTURE_ACCELERATION_WINDOW / 2)
}
