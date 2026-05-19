import * as THREE from 'three'

import { canBoardPassengerAtParkingGate, type GameState, type Passenger } from '../../gameEngine'
import {
  feederCurve,
  feederPassengerPosition,
  passengerGateCycle,
  passengerGateProgress,
  passengerSpacing,
  queueLayoutForState,
  queuePosition,
} from '../sceneGeometry'
import type { MovingCarRenderItem, PassengerRenderItem } from '../sceneTypes'

export function animatePassengers(passengers: PassengerRenderItem[], phase: number, elapsed: number): void {
  for (const item of passengers) {
    const position = queuePosition(phase + item.offset, item.layout)
    const y = 0.12 + Math.sin(elapsed * 6 + item.offset) * 0.025
    if (item.entry) {
      const progress = Math.min(1, Math.max(0, (performance.now() / 1000 - item.entry.startedAt) / item.entry.duration))
      const eased = progress * progress * (3 - 2 * progress)
      const target = new THREE.Vector3(position.x, y, position.z)
      if (item.entry.via) {
        const oneMinus = 1 - eased
        item.mesh.position.set(
          oneMinus * oneMinus * item.entry.from.x + 2 * oneMinus * eased * item.entry.via.x + eased * eased * target.x,
          oneMinus * oneMinus * item.entry.from.y + 2 * oneMinus * eased * item.entry.via.y + eased * eased * target.y,
          oneMinus * oneMinus * item.entry.from.z + 2 * oneMinus * eased * item.entry.via.z + eased * eased * target.z,
        )
      } else {
        item.mesh.position.lerpVectors(item.entry.from, target, eased)
      }
      if (progress >= 1) {
        delete item.entry
      }
    } else {
      item.mesh.position.set(position.x, y, position.z)
    }
    item.mesh.rotation.y = Math.sin(elapsed * 2 + item.offset) * 0.16
  }
}

export function createPassengerEntryAnimation(
  passenger: Passenger,
  previousFeederPassengers: Passenger[],
  previousLayout: ReturnType<typeof queueLayoutForState>,
  target: THREE.Vector3,
): NonNullable<PassengerRenderItem['entry']> {
  const from = feederPassengerPosition(passenger, previousFeederPassengers, previousLayout)
  from.y = 0.1
  const side: -1 | 1 = passenger.feederSide === 'right' ? 1 : -1
  const via = feederCurve(side, previousLayout).getPointAt(0.08)
  via.y = 0.1
  const distance = from.distanceTo(target) + via.distanceTo(target)

  return {
    from,
    via,
    startedAt: performance.now() / 1000,
    duration: Math.max(0.55, Math.min(1.05, distance * 0.18)),
  }
}

export function notifyPassengerGate(
  passengers: PassengerRenderItem[],
  phase: number,
  passengerGateCycles: Map<string, number>,
  state: GameState,
  movingCars: MovingCarRenderItem[],
  elapsed: number,
  onPassengerGate: (passengerId: string) => void,
): void {
  let boardingsThisFrame = 0
  const unavailableCarIds = activeParkingCarIds(movingCars, elapsed)
  for (const passenger of passengers) {
    const currentCycle = passengerGateCycle(phase, passenger.offset, passenger.layout)
    const previousCycle = passengerGateCycles.get(passenger.id) ?? currentCycle
    const crossedGate = currentCycle > previousCycle
    const nearGate = passengerGateProgress(phase, passenger.offset, passenger.layout) <= passengerSpacing() * 0.9
    const canBoard = canBoardPassengerAtParkingGate(state, passenger.id, unavailableCarIds)

    if ((crossedGate || nearGate) && canBoard) {
      passengerGateCycles.set(passenger.id, currentCycle)
      onPassengerGate(passenger.id)
      boardingsThisFrame += 1
      if (boardingsThisFrame >= 4) {
        return
      }
    } else if (crossedGate) {
      passengerGateCycles.set(passenger.id, currentCycle)
    }
  }
}

export function activeParkingCarIds(cars: MovingCarRenderItem[], elapsed: number): Set<string> {
  const carIds = new Set<string>()
  for (const car of cars) {
    if (car.carId && car.movementKind === 'parking' && elapsed - car.startedAt < car.duration) {
      carIds.add(car.carId)
    }
  }

  return carIds
}
