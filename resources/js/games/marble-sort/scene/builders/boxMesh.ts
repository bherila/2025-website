import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import {
  BOX_MARBLE_COUNT,
  MARBLE_COLORS,
  MARBLE_PATTERNS,
  type MarbleBox,
} from '../../gameEngine'
import { gridCellPosition } from '../sceneGeometry'
import { createTextSprite } from '../threeUtils'
import { createMarbleMesh } from './marbleMesh'

interface BoxMeshOptions {
  displayHidden: boolean
  openable: boolean
}

export function createBoxMesh(box: MarbleBox, colorblindMode: boolean, options: BoxMeshOptions): THREE.Group {
  const group = new THREE.Group()
  if (options.openable) {
    group.userData.boxId = box.id
  }
  group.position.copy(gridCellPosition(box.position))

  const color = options.displayHidden ? '#a4b1c4' : MARBLE_COLORS[box.color].hex
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(0.88, 0.36, 0.74, 4, 0.1),
    new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.02 }),
  )
  body.castShadow = true
  body.receiveShadow = true
  if (options.openable) {
    body.userData.boxId = box.id
  }
  group.add(body)

  if (options.displayHidden) {
    const sprite = createTextSprite('?', { fontSize: 84 })
    sprite.position.set(0, 0.38, 0)
    sprite.scale.set(0.48, 0.24, 1)
    sprite.material.depthTest = false
    sprite.renderOrder = 2
    group.add(sprite)

    return group
  }

  if (options.openable) {
    for (let index = 0; index < BOX_MARBLE_COUNT; index += 1) {
      const marble = createMarbleMesh(box.color, 0.085)
      const column = index % 3
      const row = Math.floor(index / 3)
      marble.position.set((column - 1) * 0.22, 0.22, (row - 1) * 0.18)
      group.add(marble)
    }
  }

  if (colorblindMode) {
    const label = createTextSprite(patternLabel(MARBLE_PATTERNS[box.color]), {
      background: '#ffffff',
      color: '#111827',
      fontSize: 64,
    })
    label.position.set(0.32, 0.4, -0.26)
    label.scale.set(0.22, 0.11, 1)
    group.add(label)
  }

  return group
}

function patternLabel(pattern: string): string {
  return pattern.slice(0, 1).toUpperCase()
}
