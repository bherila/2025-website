import * as THREE from 'three'

import { type Car, type Direction, directionStep, type GameState, getCarCells, gridCellKey, pathCellsToExit } from '../../gameEngine'
import { BLOCKED_BOUNCE_DURATION } from '../sceneConstants'
import { createBlockedRoute, routeSegmentLengths } from '../sceneGeometry'
import type { MovingCarRenderItem, RoutePoint } from '../sceneTypes'
import { findCarId } from '../threeUtils'

const IMPACT_DURATION = 0.52
const BLOCKER_CALLOUT_DURATION = 0.5
const PARTICLE_COUNT = 9

export function startBlockedCarAnimation(
  car: Car,
  state: GameState,
  mesh: THREE.Group,
  movingCars: MovingCarRenderItem[],
  effects: THREE.Group,
): void {
  const route = createBlockedRoute(car, state)
  const segmentLengths = routeSegmentLengths(route)
  const totalLength = segmentLengths.reduce((total, length) => total + length, 0)
  const startedAt = performance.now() / 1000
  movingCars.push({
    carId: car.id,
    movementKind: 'blocked',
    mesh,
    route,
    segmentLengths,
    totalLength,
    startedAt,
    duration: BLOCKED_BOUNCE_DURATION,
  })

  const collision = route[1]?.position
  if (!collision) {
    return
  }

  startImpactPuff(collision, directionVector(car.direction), effects, movingCars, startedAt)

  const blockingCarId = findBlockingCarId(car, state)
  const blockingMesh = blockingCarId ? findSiblingCarMesh(mesh, blockingCarId) : null
  if (blockingCarId && blockingMesh) {
    startBlockingCarCallout(blockingCarId, blockingMesh, movingCars, startedAt)
  }
}

function startImpactPuff(
  collision: THREE.Vector3,
  direction: THREE.Vector3,
  effects: THREE.Group,
  movingCars: MovingCarRenderItem[],
  startedAt: number,
): void {
  const group = new THREE.Group()
  const origin = collision.clone().add(direction.clone().multiplyScalar(-0.08))
  origin.y = 0.22
  group.position.copy(origin)

  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const material = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      opacity: 0.55,
      roughness: 0.8,
      transparent: true,
    })
    const size = 0.06 + (index % 3) * 0.018
    const particle = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material)
    const spread = ((index % 5) - 2) * 0.055
    const lift = 0.03 + Math.floor(index / 3) * 0.035
    const backward = 0.06 + index * 0.012
    particle.position.set(
      -direction.z * spread - direction.x * backward,
      lift,
      direction.x * spread - direction.z * backward,
    )
    particle.rotation.set(index * 0.7, index * 0.42, index * 0.31)
    group.add(particle)
  }

  effects.add(group)
  const route = stationaryRoute(origin)
  movingCars.push({
    movementKind: 'impact',
    mesh: group,
    route,
    segmentLengths: [0],
    totalLength: 0,
    startedAt,
    duration: IMPACT_DURATION,
    removeOnComplete: true,
    skipRouteMotion: true,
    onUpdate: (item, progress): void => {
      const scale = 0.7 + progress * 1.85
      item.mesh.scale.setScalar(scale)
      item.mesh.position.y = origin.y + progress * 0.16
      item.mesh.traverse((child) => {
        const particle = child as THREE.Mesh
        const material = particle.material
        if (material instanceof THREE.MeshStandardMaterial) {
          material.opacity = Math.max(0, 0.55 * (1 - progress))
        }
      })
    },
  })
}

function startBlockingCarCallout(
  carId: string,
  mesh: THREE.Group,
  movingCars: MovingCarRenderItem[],
  startedAt: number,
): void {
  const basePosition = mesh.position.clone()
  const baseScale = mesh.scale.clone()
  const route = stationaryRoute(basePosition)

  movingCars.push({
    carId,
    movementKind: 'blocked-cause',
    mesh,
    route,
    segmentLengths: [0],
    totalLength: 0,
    startedAt,
    duration: BLOCKER_CALLOUT_DURATION,
    skipRouteMotion: true,
    onUpdate: (item, progress): void => {
      const shake = Math.sin(progress * Math.PI * 10) * (1 - progress) * 0.055
      const pulse = 1 + Math.sin(progress * Math.PI) * 0.045
      item.mesh.position.set(basePosition.x + shake, basePosition.y, basePosition.z)
      item.mesh.scale.set(baseScale.x * pulse, baseScale.y * pulse, baseScale.z * pulse)
    },
    onComplete: (item): void => {
      item.mesh.position.copy(basePosition)
      item.mesh.scale.copy(baseScale)
    },
  })
}

function findBlockingCarId(car: Car, state: GameState): string | null {
  const path = pathCellsToExit(car, state.boardWidth, state.boardHeight)
  const fieldCars = state.cars.filter((candidate) => candidate.status === 'field' && candidate.id !== car.id)
  const occupiedCarIds = new Map<string, string>()

  for (const candidate of fieldCars) {
    for (const cell of getCarCells(candidate)) {
      occupiedCarIds.set(gridCellKey(cell), candidate.id)
    }
  }

  for (const cell of path) {
    const carId = occupiedCarIds.get(gridCellKey(cell))
    if (carId) {
      return carId
    }
  }

  return null
}

function findSiblingCarMesh(mesh: THREE.Group, carId: string): THREE.Group | null {
  const parent = mesh.parent
  if (!parent) {
    return null
  }

  for (const child of parent.children) {
    if (findCarId(child) === carId) {
      return child as THREE.Group
    }
  }

  return null
}

function directionVector(direction: Direction): THREE.Vector3 {
  const step = directionStep(direction)

  return new THREE.Vector3(step.x, 0, step.y).normalize()
}

function stationaryRoute(position: THREE.Vector3): RoutePoint[] {
  return [
    { position, rotationY: 0 },
    { position, rotationY: 0 },
  ]
}
