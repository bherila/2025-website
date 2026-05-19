import * as THREE from 'three'

export function createPassengerMesh(color: string): THREE.Group {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.42 })
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), material)
  head.position.y = 0.45
  head.castShadow = true
  group.add(head)

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.24, 8, 16), material)
  body.position.y = 0.22
  body.castShadow = true
  group.add(body)

  return group
}
