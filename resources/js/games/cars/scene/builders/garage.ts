import * as THREE from 'three'

import type { Direction } from '../../gameEngine'
import { CELL_SIZE } from '../sceneConstants'
import { gridToWorld, rotationForDirection } from '../sceneGeometry'
import { createTextSprite } from '../threeUtils'

export function createGarage(gridX: number, gridY: number, direction: Direction, remaining: number): THREE.Object3D {
  const group = new THREE.Group()
  const center = gridToWorld(gridX, gridY)
  group.position.set(center.x, 0.06, center.z)
  group.rotation.y = rotationForDirection(direction)

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(CELL_SIZE * 0.92, 0.12, CELL_SIZE * 0.92),
    new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.72 }),
  )
  slab.position.y = 0.04
  slab.receiveShadow = true
  group.add(slab)

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(CELL_SIZE * 0.78, 0.48, CELL_SIZE * 0.66),
    new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.58, metalness: 0.06 }),
  )
  shell.position.y = 0.35
  shell.castShadow = true
  shell.receiveShadow = true
  group.add(shell)

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(CELL_SIZE * 0.88, 0.18, CELL_SIZE * 0.82),
    new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.48, metalness: 0.12 }),
  )
  roof.position.y = 0.68
  roof.castShadow = true
  group.add(roof)

  const doorway = new THREE.Mesh(
    new THREE.BoxGeometry(CELL_SIZE * 0.54, 0.36, 0.08),
    new THREE.MeshStandardMaterial({ color: '#020617', roughness: 0.45 }),
  )
  doorway.position.set(0, 0.32, CELL_SIZE * 0.34)
  group.add(doorway)

  const countBadge = createTextSprite(`x${remaining}`, '#ffffff', 'rgba(15, 23, 42, 0.94)', 68)
  countBadge.position.set(0, 1.06, 0)
  countBadge.scale.set(0.72, 0.5, 1)
  group.add(countBadge)

  const label = createTextSprite('GARAGE', '#cbd5e1', 'rgba(15, 23, 42, 0.78)', 24)
  label.position.set(0, 0.76, CELL_SIZE * 0.35)
  label.scale.set(0.62, 0.2, 1)
  group.add(label)

  const silhouetteCount = Math.min(remaining, 4)
  for (let index = 0; index < silhouetteCount; index += 1) {
    const silhouette = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.08, 0.28),
      new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.6, metalness: 0.05 }),
    )
    silhouette.position.set(-0.24 + index * 0.16, 0.79, -0.22)
    silhouette.castShadow = true
    group.add(silhouette)
  }

  return group
}
