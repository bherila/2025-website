import * as CANNON from 'cannon-es'
import * as THREE from 'three'

import { type FallingMarble } from '../../gameEngine'
import { gridCellPosition } from '../sceneGeometry'
import { type PhysicsWorld, spawnMarbleBody } from './world'

export interface MarbleBodyManager {
  ensure: (marbles: FallingMarble[]) => void
  release: (id: string) => CANNON.Body | undefined
  release_all: () => void
  get: (id: string) => CANNON.Body | undefined
  applyToMesh: (id: string, mesh: THREE.Object3D) => void
}

export function createMarbleBodyManager(physics: PhysicsWorld): MarbleBodyManager {
  const bodies = new Map<string, CANNON.Body>()
  let spawnIndex = 0

  return {
    ensure(marbles) {
      for (const marble of marbles) {
        if (!bodies.has(marble.id)) {
          const source = gridCellPosition(marble.from)
          const body = spawnMarbleBody(
            physics.world,
            physics.marbleMaterial,
            source,
            spawnIndex,
          )
          spawnIndex += 1
          bodies.set(marble.id, body)
        }
      }
    },
    release(id) {
      const body = bodies.get(id)
      if (body) {
        physics.world.removeBody(body)
        bodies.delete(id)
      }
      return body
    },
    release_all() {
      for (const body of bodies.values()) {
        physics.world.removeBody(body)
      }
      bodies.clear()
    },
    get(id) {
      return bodies.get(id)
    },
    applyToMesh(id, mesh) {
      const body = bodies.get(id)
      if (!body) {
        return
      }
      mesh.position.set(body.position.x, body.position.y, body.position.z)
      mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
    },
  }
}
