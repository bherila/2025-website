import * as THREE from 'three'

import { MARBLE_COLORS, type MarbleColor } from '../../gameEngine'

export function createMarbleMesh(color: MarbleColor, radius = 0.13): THREE.Group {
  const group = new THREE.Group()
  const material = new THREE.MeshPhysicalMaterial({
    color: MARBLE_COLORS[color].hex,
    metalness: 0.0,
    roughness: 0.2,
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
    envMapIntensity: 0.4,
  })
  const marble = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 18), material)
  marble.castShadow = true
  marble.receiveShadow = true
  group.add(marble)

  const highlight = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.3, 12, 8),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: color === 'white' ? 0.5 : 0.28 }),
  )
  highlight.position.set(-radius * 0.32, radius * 0.42, radius * 0.35)
  group.add(highlight)

  return group
}
