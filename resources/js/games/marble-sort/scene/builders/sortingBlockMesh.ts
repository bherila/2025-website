import * as THREE from 'three'

import {
  MARBLE_COLORS,
  MARBLE_PATTERNS,
  SORTING_BLOCK_CAPACITY,
  type SortingBlock,
  type SortingStack,
} from '../../gameEngine'
import {
  SORTING_STACK_BLOCK_DEPTH,
  SORTING_STACK_VISIBLE_BLOCKS,
} from '../sceneConstants'
import {
  sortingStackBlockOffset,
  sortingStackColumnPosition,
} from '../sceneGeometry'
import { createTextSprite } from '../threeUtils'

const BLOCK_WIDTH = 0.92
const BLOCK_HEIGHT = 0.34
const STUD_RADIUS = 0.13

export function createSortingStackMesh(
  stack: SortingStack,
  totalStacks: number,
  colorblindMode: boolean,
): THREE.Group {
  const group = new THREE.Group()
  group.position.copy(sortingStackColumnPosition(stack.index, totalStacks))
  group.userData.stackId = stack.id
  group.userData.stackIndex = stack.index

  if (stack.blocks.length === 0) {
    const lane = new THREE.Mesh(
      new THREE.BoxGeometry(BLOCK_WIDTH, 0.08, SORTING_STACK_BLOCK_DEPTH * 1.4),
      new THREE.MeshStandardMaterial({ color: '#dde7ec', roughness: 0.78, transparent: true, opacity: 0.32 }),
    )
    lane.position.set(0, 0.05, 0)
    group.add(lane)

    return group
  }

  const visible = stack.blocks.slice(0, SORTING_STACK_VISIBLE_BLOCKS)
  visible.forEach((block, depth) => {
    const blockGroup = createSortingBlockMesh(block, depth === 0)
    blockGroup.position.copy(sortingStackBlockOffset(depth))
    blockGroup.userData.blockId = block.id
    blockGroup.userData.depth = depth
    group.add(blockGroup)
  })

  if (colorblindMode) {
    const topBlock = stack.blocks[0]
    if (topBlock) {
      const label = createTextSprite(MARBLE_PATTERNS[topBlock.color].slice(0, 1).toUpperCase(), {
        background: '#ffffff',
        color: '#111827',
        fontSize: 62,
      })
      label.position.set(0.36, 0.52, 0.06)
      label.scale.set(0.22, 0.11, 1)
      group.add(label)
    }
  }

  return group
}

export function createSortingBlockMesh(block: SortingBlock, isActive: boolean): THREE.Group {
  const group = new THREE.Group()
  const hex = MARBLE_COLORS[block.color].hex
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(BLOCK_WIDTH, BLOCK_HEIGHT, SORTING_STACK_BLOCK_DEPTH),
    new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.4,
      metalness: 0.02,
    }),
  )
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(BLOCK_WIDTH + 0.02, BLOCK_HEIGHT * 0.32, SORTING_STACK_BLOCK_DEPTH + 0.02),
    new THREE.MeshStandardMaterial({
      color: darken(hex, 0.18),
      roughness: 0.55,
      transparent: true,
      opacity: 0.7,
    }),
  )
  rim.position.y = -BLOCK_HEIGHT / 2 + 0.04
  group.add(rim)

  if (isActive) {
    for (let slot = 0; slot < SORTING_BLOCK_CAPACITY; slot += 1) {
      const filled = slot < block.slotsFilled
      const dimpleX = (slot - 1) * 0.28
      const dimpleY = BLOCK_HEIGHT / 2 + 0.005
      const dimple = new THREE.Mesh(
        new THREE.CylinderGeometry(STUD_RADIUS * 0.92, STUD_RADIUS * 0.78, 0.04, 24),
        new THREE.MeshStandardMaterial({ color: darken(hex, 0.55), roughness: 0.65 }),
      )
      dimple.position.set(dimpleX, dimpleY, 0)
      group.add(dimple)

      if (filled) {
        const marble = new THREE.Mesh(
          new THREE.SphereGeometry(STUD_RADIUS * 0.92, 22, 14),
          new THREE.MeshStandardMaterial({ color: hex, roughness: 0.28, metalness: 0.05 }),
        )
        marble.position.set(dimpleX, dimpleY + STUD_RADIUS * 0.55, 0)
        marble.castShadow = true
        group.add(marble)
        const highlight = new THREE.Mesh(
          new THREE.SphereGeometry(STUD_RADIUS * 0.3, 12, 8),
          new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 }),
        )
        highlight.position.set(dimpleX - STUD_RADIUS * 0.3, dimpleY + STUD_RADIUS * 0.85, STUD_RADIUS * 0.3)
        group.add(highlight)
      }
    }
  } else {
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const stud = new THREE.Mesh(
          new THREE.SphereGeometry(0.075, 14, 10),
          new THREE.MeshStandardMaterial({ color: hex, roughness: 0.32 }),
        )
        stud.position.set((column - 1) * 0.22, BLOCK_HEIGHT / 2 + 0.02, (row - 1) * 0.12)
        group.add(stud)
      }
    }
  }

  return group
}

function darken(hex: string, amount: number): string {
  const color = new THREE.Color(hex)
  color.lerp(new THREE.Color('#000000'), Math.max(0, Math.min(1, amount)))

  return `#${color.getHexString()}`
}
