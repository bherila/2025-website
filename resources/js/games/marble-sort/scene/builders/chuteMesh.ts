import * as THREE from 'three'

import { type Chute } from '../../gameEngine'
import { chutePosition } from '../sceneGeometry'
import { createTextSprite } from '../threeUtils'

export function createChuteMesh(chute: Chute): THREE.Group {
  const group = new THREE.Group()
  group.position.copy(chutePosition(chute.row, chute.side))
  group.rotation.z = chute.side === 'left' ? -0.08 : 0.08

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.34, 0.56),
    new THREE.MeshStandardMaterial({ color: '#4f7edb', roughness: 0.42 }),
  )
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.38, 0.62),
    new THREE.MeshStandardMaterial({ color: '#2452a7', roughness: 0.45 }),
  )
  cap.position.x = chute.side === 'left' ? 0.36 : -0.36
  group.add(cap)

  const label = createTextSprite(String(chute.remaining), {
    background: '#ffffff',
    color: '#ffffff',
    fontSize: 74,
  })
  label.position.set(0, 0.36, 0)
  label.scale.set(0.34, 0.18, 1)
  group.add(label)

  return group
}
