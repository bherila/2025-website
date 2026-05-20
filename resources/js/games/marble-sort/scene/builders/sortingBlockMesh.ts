import * as THREE from 'three'

import {
  MARBLE_COLORS,
  MARBLE_PATTERNS,
  SORTING_BLOCK_CAPACITY,
  type SortingStack,
} from '../../gameEngine'
import { sortingStackPosition } from '../sceneGeometry'
import { createTextSprite } from '../threeUtils'

export function createSortingStackMesh(stack: SortingStack, totalStacks: number, colorblindMode: boolean): THREE.Group {
  const group = new THREE.Group()
  group.position.copy(sortingStackPosition(stack.index, totalStacks))

  const visibleBlocks = stack.blocks.slice(0, 5)
  visibleBlocks.forEach((block, index) => {
    const blockMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.88, 0.28, 0.48),
      new THREE.MeshStandardMaterial({
        color: MARBLE_COLORS[block.color].hex,
        roughness: 0.42,
      }),
    )
    blockMesh.position.set(0, 0.1 + index * 0.03, -index * 0.43)
    blockMesh.castShadow = true
    blockMesh.receiveShadow = true
    group.add(blockMesh)

    if (index === 0) {
      for (let slot = 0; slot < SORTING_BLOCK_CAPACITY; slot += 1) {
        const filled = slot < block.slotsFilled
        const slotMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 18, 12),
          new THREE.MeshStandardMaterial({
            color: filled ? MARBLE_COLORS[block.color].hex : '#000000',
            roughness: 0.35,
            transparent: true,
            opacity: filled ? 1 : 0.28,
          }),
        )
        slotMesh.position.set((slot - 1) * 0.23, 0.27, -0.08)
        group.add(slotMesh)
      }
    }
  })

  if (stack.blocks.length === 0) {
    const empty = new THREE.Mesh(
      new THREE.BoxGeometry(0.88, 0.08, 1.6),
      new THREE.MeshStandardMaterial({ color: '#aeb8cf', roughness: 0.55, transparent: true, opacity: 0.34 }),
    )
    empty.position.z = -0.55
    group.add(empty)
  }

  const topBlockColor = stack.blocks[0]?.color
  if (colorblindMode && topBlockColor) {
    const label = createTextSprite(MARBLE_PATTERNS[topBlockColor].slice(0, 1).toUpperCase(), {
      background: '#ffffff',
      color: '#111827',
      fontSize: 62,
    })
    label.position.set(0.31, 0.42, 0.05)
    label.scale.set(0.2, 0.1, 1)
    group.add(label)
  }

  return group
}
