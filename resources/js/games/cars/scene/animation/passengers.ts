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
import type {
  MovingCarRenderItem,
  PassengerInstanceHandle,
  PassengerInstancePools,
  PassengerRenderHandle,
  PassengerRenderItem,
} from '../sceneTypes'

export function animatePassengers(passengers: PassengerRenderItem[], phase: number, elapsed: number): void {
  const dirtyPools = new Set<PassengerInstancePools>()
  for (const item of passengers) {
    const position = queuePosition(phase + item.offset, item.layout)
    const y = 0.12 + Math.sin(elapsed * 6 + item.offset) * 0.025
    passengerPosition.set(position.x, y, position.z)
    if (item.entry) {
      const progress = Math.min(1, Math.max(0, (performance.now() / 1000 - item.entry.startedAt) / item.entry.duration))
      const eased = progress * progress * (3 - 2 * progress)
      if (item.entry.via) {
        const oneMinus = 1 - eased
        passengerPosition.set(
          oneMinus * oneMinus * item.entry.from.x + 2 * oneMinus * eased * item.entry.via.x + eased * eased * position.x,
          oneMinus * oneMinus * item.entry.from.y + 2 * oneMinus * eased * item.entry.via.y + eased * eased * y,
          oneMinus * oneMinus * item.entry.from.z + 2 * oneMinus * eased * item.entry.via.z + eased * eased * position.z,
        )
      } else {
        passengerPosition.lerpVectors(item.entry.from, passengerPosition, eased)
      }
      if (progress >= 1) {
        delete item.entry
      }
    }
    applyPassengerTransform(item.mesh, passengerPosition, Math.sin(elapsed * 2 + item.offset) * 0.16, dirtyPools)
  }

  for (const pool of dirtyPools) {
    markPassengerInstancePoolDirty(pool)
  }
}

export function setPassengerRenderHandleTransform(
  handle: PassengerRenderHandle,
  position: THREE.Vector3,
  rotationY: number,
): void {
  if (isPassengerInstanceHandle(handle)) {
    updatePassengerInstance(handle, position, rotationY)
    markPassengerInstancePoolDirty(handle.pool)

    return
  }

  handle.position.copy(position)
  handle.rotation.y = rotationY
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
  const distance = from.distanceTo(via) + via.distanceTo(target)

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

const passengerPosition = new THREE.Vector3()
const instancePosition = new THREE.Vector3()
const instanceQuaternion = new THREE.Quaternion()
const instanceEuler = new THREE.Euler()
const instanceScale = new THREE.Vector3(1, 1, 1)
const instanceMatrix = new THREE.Matrix4()

function applyPassengerTransform(
  handle: PassengerRenderHandle,
  position: THREE.Vector3,
  rotationY: number,
  dirtyPools: Set<PassengerInstancePools>,
): void {
  if (isPassengerInstanceHandle(handle)) {
    updatePassengerInstance(handle, position, rotationY)
    dirtyPools.add(handle.pool)

    return
  }

  handle.position.copy(position)
  handle.rotation.y = rotationY
}

function updatePassengerInstance(handle: PassengerInstanceHandle, position: THREE.Vector3, rotationY: number): void {
  writeInstanceMatrix(handle.pool.headMesh, handle.headIndex, position, 0.45, rotationY)
  writeInstanceMatrix(handle.pool.bodyMesh, handle.bodyIndex, position, 0.22, rotationY)
  handle.pool.headMesh.setColorAt(handle.headIndex, handle.color)
  handle.pool.bodyMesh.setColorAt(handle.bodyIndex, handle.color)

  if (handle.badgeIndex !== null && handle.badgePattern !== null) {
    const badgeMesh = handle.pool.badgeMeshes[handle.badgePattern]
    if (badgeMesh) {
      writeInstanceMatrix(badgeMesh, handle.badgeIndex, position, 0.61, rotationY, -Math.PI / 2)
    }
  }
}

function writeInstanceMatrix(
  mesh: THREE.InstancedMesh,
  index: number,
  position: THREE.Vector3,
  yOffset: number,
  rotationY: number,
  rotationX = 0,
): void {
  instancePosition.set(position.x, position.y + yOffset, position.z)
  instanceEuler.set(rotationX, rotationY, 0)
  instanceQuaternion.setFromEuler(instanceEuler)
  instanceMatrix.compose(instancePosition, instanceQuaternion, instanceScale)
  mesh.setMatrixAt(index, instanceMatrix)
}

function isPassengerInstanceHandle(handle: PassengerRenderHandle): handle is PassengerInstanceHandle {
  return !(handle instanceof THREE.Group)
}

function markPassengerInstancePoolDirty(pool: PassengerInstancePools): void {
  pool.headMesh.instanceMatrix.needsUpdate = true
  pool.bodyMesh.instanceMatrix.needsUpdate = true
  if (pool.headMesh.instanceColor) {
    pool.headMesh.instanceColor.needsUpdate = true
  }
  if (pool.bodyMesh.instanceColor) {
    pool.bodyMesh.instanceColor.needsUpdate = true
  }
  for (const badgeMesh of Object.values(pool.badgeMeshes)) {
    if (badgeMesh) {
      badgeMesh.instanceMatrix.needsUpdate = true
    }
  }
}
