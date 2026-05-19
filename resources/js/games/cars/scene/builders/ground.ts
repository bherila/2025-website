import * as THREE from 'three'

import { QUEUE_Z } from '../sceneConstants'

export function createGround(): THREE.Object3D {
  const group = new THREE.Group()

  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 18),
    new THREE.MeshStandardMaterial({ color: '#8bd974', roughness: 0.88 }),
  )
  grass.rotation.x = -Math.PI / 2
  grass.position.z = QUEUE_Z - 1.5
  grass.receiveShadow = true
  group.add(grass)

  const lot = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 16),
    new THREE.MeshStandardMaterial({ color: '#d9ecf1', roughness: 0.76 }),
  )
  lot.rotation.x = -Math.PI / 2
  lot.position.z = 2.8
  lot.receiveShadow = true
  group.add(lot)

  return group
}
