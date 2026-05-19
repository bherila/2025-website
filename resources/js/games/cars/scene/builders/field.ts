import * as THREE from 'three'

import type { GameState } from '../../gameEngine'
import { CELL_SIZE, FIELD_Z } from '../sceneConstants'

export function createField(state: GameState): THREE.Object3D {
  const group = new THREE.Group()
  const width = state.boardWidth * CELL_SIZE + 0.8
  const gridHeight = state.boardHeight * CELL_SIZE
  const bottomPad = 0.4
  const height = gridHeight + bottomPad
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.14, height),
    new THREE.MeshStandardMaterial({ color: '#dbe3ef', roughness: 0.78 }),
  )
  base.position.set(0, 0.01, FIELD_Z + bottomPad / 2)
  base.receiveShadow = true
  group.add(base)

  const gridMaterial = new THREE.MeshStandardMaterial({ color: '#b7c2d1', roughness: 0.7 })
  for (let x = 0; x <= state.boardWidth; x += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.02, gridHeight), gridMaterial)
    line.position.set((x - state.boardWidth / 2) * CELL_SIZE, 0.1, FIELD_Z)
    group.add(line)
  }

  for (let y = 0; y <= state.boardHeight; y += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.02, 0.018), gridMaterial)
    line.position.set(0, 0.11, FIELD_Z + (y - state.boardHeight / 2) * CELL_SIZE)
    group.add(line)
  }

  return group
}
