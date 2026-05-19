import * as THREE from 'three'

import { retainPersistentMovingCars, retainSceneMovingCars } from '../CarsScene'
import { generateLevel, loopPassengerCapacity } from '../gameEngine'
import { accelerateThenConstantRouteProgress } from '../scene/animation/departingCar'
import { animateMovingCars, positionOnRoute } from '../scene/animation/movingCars'
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

  it('accelerates departing cars and then keeps a constant route velocity', () => {
    const earlyDelta = accelerateThenConstantRouteProgress(0.10) - accelerateThenConstantRouteProgress(0.05)
    const cruiseDelta = accelerateThenConstantRouteProgress(0.60) - accelerateThenConstantRouteProgress(0.55)
    const lateDelta = accelerateThenConstantRouteProgress(0.95) - accelerateThenConstantRouteProgress(0.90)

    expect(accelerateThenConstantRouteProgress(0)).toBe(0)
    expect(accelerateThenConstantRouteProgress(1)).toBe(1)
    expect(earlyDelta).toBeLessThan(cruiseDelta)
    expect(cruiseDelta).toBeCloseTo(lateDelta, 5)
  })

  it('uses the departure route curve without parking bounce', () => {
    const car = makeMovingCar({
      movementKind: 'departure',
      route: [
        { position: new THREE.Vector3(0, 0.08, 0), rotationY: 0 },
        { position: new THREE.Vector3(10, 0.08, 0), rotationY: Math.PI / 2 },
      ],
      segmentLengths: [10],
      totalLength: 10,
      routeProgress: accelerateThenConstantRouteProgress,
    })

    animateMovingCars([car], 0.5)

    const expected = positionOnRoute(car, accelerateThenConstantRouteProgress(0.5))
    expect(car.mesh.position.x).toBeCloseTo(expected.position.x)
    expect(car.mesh.position.y).toBeCloseTo(0.08)
    expect(car.mesh.rotation.y).toBeCloseTo(expected.rotationY)
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
