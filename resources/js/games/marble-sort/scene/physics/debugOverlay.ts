import * as CANNON from 'cannon-es'
import * as THREE from 'three'

export function createPhysicsDebugOverlay(body: CANNON.Body): THREE.Group {
  const group = new THREE.Group()
  const material = new THREE.LineBasicMaterial({ color: '#ff2f6e' })

  for (let index = 0; index < body.shapes.length; index += 1) {
    const shape = body.shapes[index]
    const offset = body.shapeOffsets[index]
    const orientation = body.shapeOrientations[index]
    if (!shape || !offset || !orientation || !(shape instanceof CANNON.Box)) {
      continue
    }

    const half = shape.halfExtents
    const geometry = new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2)
    const edges = new THREE.EdgesGeometry(geometry)
    const mesh = new THREE.LineSegments(edges, material)
    mesh.position.set(offset.x, offset.y, offset.z)
    mesh.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w)
    group.add(mesh)
    geometry.dispose()
  }

  return group
}

export function physicsDebugOverlayEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const params = new URLSearchParams(window.location.search)
  const value = params.get('debug')
  return value === 'physics' || params.has('debugPhysics')
}
