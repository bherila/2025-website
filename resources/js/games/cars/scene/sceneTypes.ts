import * as THREE from 'three'

import type { CarPattern } from '../gameTypes'

export interface PassengerRenderItem {
  id: string
  mesh: PassengerRenderHandle
  offset: number
  layout: QueueLayout
  entry?: PassengerEntryRenderItem
}

export type PassengerRenderHandle = THREE.Group | PassengerInstanceHandle

export interface PassengerInstanceHandle {
  badgeIndex: number | null
  badgePattern: CarPattern | null
  bodyIndex: number
  color: THREE.Color
  headIndex: number
  pool: PassengerInstancePools
}

export interface PassengerInstancePools {
  badgeCounts: Partial<Record<CarPattern, number>>
  badgeMeshes: Partial<Record<CarPattern, THREE.InstancedMesh>>
  bodyMesh: THREE.InstancedMesh
  capacity: number
  headMesh: THREE.InstancedMesh
  used: number
}

export interface MovingCarRenderItem {
  carId?: string
  movementKind?: 'blocked' | 'blocked-cause' | 'departure' | 'impact' | 'parking'
  mesh: THREE.Group
  route: RoutePoint[]
  segmentLengths: number[]
  totalLength: number
  startedAt: number
  duration: number
  removeOnComplete?: boolean
  routeProgress?: (progress: number) => number
  skipRouteMotion?: boolean
  onUpdate?: (item: MovingCarRenderItem, progress: number, routeProgress: number) => void
  onComplete?: (item: MovingCarRenderItem) => void
}

export interface BoardingPassengerRenderItem {
  carId: string
  mesh: THREE.Group
  from: THREE.Vector3
  to: THREE.Vector3
  startedAt: number
  duration: number
}

export interface PassengerEntryRenderItem {
  from: THREE.Vector3
  via?: THREE.Vector3
  startedAt: number
  duration: number
}

export interface RoutePoint {
  position: THREE.Vector3
  rotationY: number
}

export interface PersistentMovingCarCandidate {
  mesh: THREE.Group
  removeOnComplete?: boolean
}

export interface QueueLayout {
  width: number
  depth: number
  straightLength: number
  capRadius: number
  perimeter: number
  halfWidth: number
  halfDepth: number
}
