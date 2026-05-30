import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import { type Chute } from '../../gameEngine'
import { chutePosition } from '../sceneGeometry'
import { createTextSprite } from '../threeUtils'

export function createChuteMesh(chute: Chute): THREE.Group {
  const group = new THREE.Group()
  group.position.copy(chutePosition(chute.row, chute.side))

  const body = new THREE.Mesh(
    new RoundedBoxGeometry(0.62, 0.28, 0.62, 4, 0.08),
    new THREE.MeshPhysicalMaterial({
      color: '#4f7edb',
      roughness: 0.34,
      metalness: 0.0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
      envMapIntensity: 0.3,
    }),
  )
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  // Trim plate facing the grid so the chute reads as "attached" to the grid edge.
  const trim = new THREE.Mesh(
    new RoundedBoxGeometry(0.08, 0.32, 0.66, 3, 0.04),
    new THREE.MeshPhysicalMaterial({
      color: '#2452a7',
      roughness: 0.4,
      metalness: 0.0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.25,
      envMapIntensity: 0.3,
    }),
  )
  trim.position.x = chute.side === 'left' ? 0.32 : -0.32
  group.add(trim)

  const label = createTextSprite(String(chute.remaining), {
    background: '#ffffff',
    color: '#111827',
    fontSize: 80,
  })
  label.position.set(0, 0.22, 0)
  label.scale.set(0.32, 0.18, 1)
  group.add(label)

  return group
}
