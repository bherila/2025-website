import * as THREE from 'three'

import { CAR_COLORS, CAR_PATTERNS, type GameState, type Passenger } from '../../gameEngine'
import { createPassengerMesh } from '../builders/passengerMesh'
import { parkingSlotPosition, queueLayoutForState, queuePosition } from '../sceneGeometry'
import type { BoardingPassengerRenderItem } from '../sceneTypes'
import { disposeObject } from '../threeUtils'

export function animateBoardingPassengers(passengers: BoardingPassengerRenderItem[], elapsed: number): void {
  for (let index = passengers.length - 1; index >= 0; index -= 1) {
    const passenger = passengers[index]
    if (!passenger) {
      continue
    }

    const progress = Math.min(1, Math.max(0, (elapsed - passenger.startedAt) / passenger.duration))
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - (Math.pow(-2 * progress + 2, 2) / 2)
    passenger.mesh.position.lerpVectors(passenger.from, passenger.to, eased)
    passenger.mesh.position.y = passenger.from.y + Math.sin(progress * Math.PI) * 0.18
    passenger.mesh.rotation.y = Math.atan2(passenger.to.x - passenger.from.x, passenger.to.z - passenger.from.z)

    if (progress >= 1) {
      passenger.mesh.parent?.remove(passenger.mesh)
      disposeObject(passenger.mesh)
      passengers.splice(index, 1)
    }
  }
}

export function startBoardingPassengerAnimations(
  previousState: GameState,
  state: GameState,
  passengerOffsets: Map<string, number>,
  passengerPhase: number,
  effects: THREE.Group,
  boardingPassengers: BoardingPassengerRenderItem[],
  colorblindMode = false,
): Map<string, number> {
  const currentPassengerIds = new Set(state.passengerQueue.map((passenger) => passenger.id))
  const removedPassengers = previousState.passengerQueue
    .filter((passenger) => !currentPassengerIds.has(passenger.id))
    .slice(0, 8)
  const queueLayout = queueLayoutForState(previousState)
  const boardingAssignments = boardingAssignmentsForTransition(previousState, state, removedPassengers)
  const departureDelays = new Map<string, number>()
  const now = performance.now() / 1000

  for (const assignment of boardingAssignments) {
    const offset = passengerOffsets.get(assignment.passenger.id) ?? 0
    const from = queuePosition(passengerPhase + offset, queueLayout)
    from.y = 0.12
    const mesh = createPassengerMesh(CAR_COLORS[assignment.passenger.color].hex, {
      colorblindMode,
      pattern: CAR_PATTERNS[assignment.passenger.color],
    })
    mesh.position.copy(from)
    effects.add(mesh)
    const duration = Math.max(0.58, Math.min(1.08, from.distanceTo(assignment.to) * 0.22))
    boardingPassengers.push({
      carId: assignment.carId,
      mesh,
      from,
      to: assignment.to,
      startedAt: now,
      duration,
    })

    departureDelays.set(assignment.carId, Math.max(departureDelays.get(assignment.carId) ?? now, now + duration + 0.16))
  }

  return departureDelays
}

export function boardingAssignmentsForTransition(
  previousState: GameState,
  state: GameState,
  removedPassengers: Passenger[],
): Array<{ carId: string, passenger: Passenger, to: THREE.Vector3 }> {
  const pendingPassengers = [...removedPassengers]
  const assignments: Array<{ carId: string, passenger: Passenger, to: THREE.Vector3 }> = []
  const previousParkedCars = previousState.cars
    .filter((candidate) => candidate.status === 'parked' && candidate.parkingSlotId)
    .sort((left, right) => parkingSlotSortValue(previousState, left.parkingSlotId) - parkingSlotSortValue(previousState, right.parkingSlotId))

  for (const previousCar of previousParkedCars) {
    const currentCar = state.cars.find((candidate) => candidate.id === previousCar.id)
    const boardedDelta = Math.max(0, (currentCar?.boarded ?? previousCar.boarded) - previousCar.boarded)
    if (boardedDelta <= 0 || !previousCar.parkingSlotId) {
      continue
    }

    const slot = previousState.parkingSlots.find((candidate) => candidate.id === previousCar.parkingSlotId)
    if (!slot) {
      continue
    }

    for (let seat = 0; seat < boardedDelta; seat += 1) {
      const passenger = pendingPassengers.shift()
      if (!passenger) {
        return assignments
      }

      assignments.push({
        carId: previousCar.id,
        passenger,
        to: boardingSeatTarget(slot.index, slot.kind, previousCar.boarded + seat),
      })
    }
  }

  return assignments
}

export function boardingSeatTarget(index: number, kind: 'regular' | 'vip', boardedIndex: number): THREE.Vector3 {
  const position = parkingSlotPosition(index, kind)
  const sideOffset = boardedIndex % 2 === 0 ? -0.18 : 0.18
  const rowOffset = Math.floor(boardedIndex / 2) * 0.18

  return new THREE.Vector3(position.x + sideOffset, 0.14, position.z + 0.22 - rowOffset)
}

export function parkingSlotSortValue(state: GameState, slotId: string | null): number {
  const slot = state.parkingSlots.find((candidate) => candidate.id === slotId)
  if (!slot) {
    return 99
  }

  return slot.kind === 'vip' ? -1 : slot.index
}
