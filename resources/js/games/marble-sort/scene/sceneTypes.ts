import * as THREE from 'three'

import { type GridPosition } from '../gameEngine'

export interface ConveyorRenderItem {
  id: string
  index: number
  mesh: THREE.Group
}

export interface BeltMarkerRenderItem {
  index: number
  mesh: THREE.Mesh
  total: number
}

export interface FallingRenderItem {
  from: GridPosition
  id: string
  mesh: THREE.Group
  startedAt: number
}

export interface SortingStackRenderItem {
  id: string
  index: number
  group: THREE.Group
  topBlockId: string | null
}

export interface ActiveTween {
  startedAt: number
  duration: number
  update: (progress: number) => void
  cleanup?: () => void
}
