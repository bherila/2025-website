import * as THREE from 'three'

import { type GridPosition } from '../gameEngine'

export interface ConveyorRenderItem {
  id: string
  index: number
  mesh: THREE.Group
  total: number
}

export interface FallingRenderItem {
  from: GridPosition
  id: string
  mesh: THREE.Group
  startedAt: number
}
