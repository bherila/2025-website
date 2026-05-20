import * as THREE from 'three'

import { type GridPosition } from '../gameEngine'

export interface ConveyorRenderItem {
  capacity: number
  id: string
  index: number
  mesh: THREE.Group
  total: number
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
