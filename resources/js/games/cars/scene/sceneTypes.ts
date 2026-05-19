import * as THREE from 'three'

export interface PassengerRenderItem {
  id: string
  mesh: THREE.Group
  offset: number
  layout: QueueLayout
  entry?: PassengerEntryRenderItem
}

export interface MovingCarRenderItem {
  carId?: string
  movementKind?: 'blocked' | 'departure' | 'parking'
  mesh: THREE.Group
  route: RoutePoint[]
  segmentLengths: number[]
  totalLength: number
  startedAt: number
  duration: number
  removeOnComplete?: boolean
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
