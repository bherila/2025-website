import * as THREE from 'three'

import {
  BOX_MARBLE_COUNT,
  MARBLE_COLORS,
  MARBLE_PATTERNS,
  type MarbleBox,
} from '../../gameEngine'
import { gridCellPosition } from '../sceneGeometry'
import { createTextSprite } from '../threeUtils'
import { createMarbleMesh } from './marbleMesh'

export function createBoxMesh(box: MarbleBox, colorblindMode: boolean): THREE.Group {
  const group = new THREE.Group()
  group.userData.boxId = box.id
  group.position.copy(gridCellPosition(box.position))

  const color = box.hidden ? '#9aa9ba' : MARBLE_COLORS[box.color].hex
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.32, 0.72),
    new THREE.MeshStandardMaterial({ color, roughness: 0.48 }),
  )
  body.castShadow = true
  body.receiveShadow = true
  body.userData.boxId = box.id
  group.add(body)

  if (box.hidden) {
    const sprite = createTextSprite('?', { fontSize: 76 })
    sprite.position.set(0, 0.34, 0)
    sprite.scale.set(0.44, 0.22, 1)
    group.add(sprite)

    return group
  }

  for (let index = 0; index < BOX_MARBLE_COUNT; index += 1) {
    const marble = createMarbleMesh(box.color, 0.075)
    const column = index % 3
    const row = Math.floor(index / 3)
    marble.position.set((column - 1) * 0.22, 0.2, (row - 1) * 0.17)
    group.add(marble)
  }

  if (colorblindMode) {
    const label = createTextSprite(patternLabel(MARBLE_PATTERNS[box.color]), {
      background: '#ffffff',
      color: '#111827',
      fontSize: 64,
    })
    label.position.set(0.3, 0.38, -0.25)
    label.scale.set(0.22, 0.11, 1)
    group.add(label)
  }

  return group
}

function patternLabel(pattern: string): string {
  return pattern.slice(0, 1).toUpperCase()
}
