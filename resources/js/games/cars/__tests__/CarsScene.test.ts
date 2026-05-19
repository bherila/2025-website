import * as THREE from 'three'

import { retainPersistentMovingCars, retainSceneMovingCars } from '../CarsScene'
import { generateLevel, loopPassengerCapacity } from '../gameEngine'
import { passengerSpacing, queueLayoutForState } from '../scene/sceneGeometry'
import type { MovingCarRenderItem } from '../scene/sceneTypes'

describe('CarsScene animation bookkeeping', () => {
  it('keeps effect-layer departure animations across scene rebuilds', () => {
    const effects = new THREE.Group()
    const content = new THREE.Group()
    const departingMesh = new THREE.Group()
    const parkingMesh = new THREE.Group()
    effects.add(departingMesh)
    content.add(parkingMesh)

    const retained = retainPersistentMovingCars([
      { mesh: departingMesh, removeOnComplete: true },
      { mesh: parkingMesh },
    ], effects)

    expect(retained).toEqual([{ mesh: departingMesh, removeOnComplete: true }])
  })

  it('keeps active parking and blocked animations across scene rebuilds', () => {
    const effects = new THREE.Group()
    const dynamicGroup = new THREE.Group()
    const staleGroup = new THREE.Group()
    const departingMesh = new THREE.Group()
    const parkingMesh = new THREE.Group()
    const blockedMesh = new THREE.Group()
    const staleMesh = new THREE.Group()

    effects.add(departingMesh)
    dynamicGroup.add(parkingMesh)
    dynamicGroup.add(blockedMesh)
    staleGroup.add(staleMesh)

    const retained = retainSceneMovingCars([
      makeMovingCar({ mesh: departingMesh, removeOnComplete: true, movementKind: 'departure' }),
      makeMovingCar({ mesh: parkingMesh, movementKind: 'parking' }),
      makeMovingCar({ mesh: blockedMesh, movementKind: 'blocked' }),
      makeMovingCar({ mesh: staleMesh, movementKind: 'parking' }),
    ], dynamicGroup, effects)

    expect(retained.map((item) => item.mesh)).toEqual([departingMesh, parkingMesh, blockedMesh])
  })

  it('sizes the loop near the active passenger buffer', () => {
    const state = generateLevel(5, 20_005)
    const readyPassengers = loopPassengerCapacity(state)
    const layout = queueLayoutForState(state)

    expect(layout.perimeter).toBeLessThanOrEqual(readyPassengers * passengerSpacing() + passengerSpacing() * 4)
  })
})

function makeMovingCar(overrides: Partial<MovingCarRenderItem> = {}): MovingCarRenderItem {
  return {
    mesh: new THREE.Group(),
    route: [],
    segmentLengths: [],
    totalLength: 0,
    startedAt: 0,
    duration: 1,
    ...overrides,
  }
}
