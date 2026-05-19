import * as THREE from 'three'

import type { GameState } from '../../gameEngine'
import { createCarMesh } from '../builders/carMesh'
import { createDepartureRoute, parkingSlotPosition, routeSegmentLengths } from '../sceneGeometry'
import type { MovingCarRenderItem } from '../sceneTypes'

export function startDepartingCarAnimations(
  previousState: GameState,
  state: GameState,
  effects: THREE.Group,
  movingCars: MovingCarRenderItem[],
  departureDelays: Map<string, number>,
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
    const mesh = createCarMesh(visualCar, start, true)
    effects.add(mesh)
    const route = createDepartureRoute(start)
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
      duration: Math.max(0.9, totalLength * 0.15),
      removeOnComplete: true,
    })
  }
}
