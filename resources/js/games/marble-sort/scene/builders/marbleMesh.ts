import * as THREE from 'three'

import { MARBLE_COLORS, type MarbleColor } from '../../gameEngine'

export function createMarbleMesh(color: MarbleColor, radius = 0.13): THREE.Group {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({
    color: MARBLE_COLORS[color].hex,
    metalness: 0.04,
    roughness: 0.28,
  })
  const marble = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 18), material)
  marble.castShadow = true
  marble.receiveShadow = true
  group.add(marble)

  const highlight = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.32, 12, 8),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: color === 'white' ? 0.65 : 0.42 }),
  )
  highlight.position.set(-radius * 0.32, radius * 0.42, radius * 0.35)
  group.add(highlight)

  return group
}
