import * as THREE from 'three'

import { passengerQueueRefreshAtForEntry, retainPersistentMovingCars, retainSceneMovingCars } from '../CarsScene'
import { type Car, generateLevel, loopPassengerCapacity, loopPassengerLayoutCapacity } from '../gameEngine'
import { accelerateThenConstantRouteProgress } from '../scene/animation/departingCar'
import { animateMovingCars, positionOnRoute, routeRotationAtSegment } from '../scene/animation/movingCars'
import { PASSENGER_LOOP_ENTRY_RETENTION_SECONDS } from '../scene/passengerLoopSlots'
import { INCOMING_LANE_Z, OUTGOING_LANE_Z } from '../scene/sceneConstants'
import {
  angleLerp,
  createParkingRoute,
  parkingSlotPosition,
  passengerSpacing,
  queueLayoutForState,
} from '../scene/sceneGeometry'
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

  it('keeps the rendered loop layout stable as the queue drains', () => {
    const state = generateLevel(10, 20_010)
    const fullLayout = queueLayoutForState(state)
    const drainedLayout = queueLayoutForState({ ...state, passengerQueue: [] })

    expect(loopPassengerCapacity({ ...state, passengerQueue: [] })).toBe(0)
    expect(loopPassengerLayoutCapacity(state)).toBeGreaterThan(0)
    expect(drainedLayout.perimeter).toBeCloseTo(fullLayout.perimeter)
    expect(drainedLayout.capRadius).toBeCloseTo(fullLayout.capRadius)
  })

  it('routes opposite horizontal parking traffic onto separate road lanes', () => {
    const leftToRight = createParkingRoute(
      makeTestCar({ direction: 'left', id: 'left-exit', position: { x: 1, y: 2 } }),
      parkingSlotPosition(5, 'regular'),
    )
    const rightToLeft = createParkingRoute(
      makeTestCar({ direction: 'right', id: 'right-exit', position: { x: 4, y: 3 } }),
      parkingSlotPosition(0, 'regular'),
    )

    expect(routeUsesLane(leftToRight, OUTGOING_LANE_Z)).toBe(true)
    expect(routeUsesLane(rightToLeft, INCOMING_LANE_Z)).toBe(true)
    expect(routeUsesLane(leftToRight, INCOMING_LANE_Z)).toBe(false)
    expect(routeUsesLane(rightToLeft, OUTGOING_LANE_Z)).toBe(false)
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

  it('uses the shortest rotation when a parking route wraps past negative pi', () => {
    expect(angleLerp(Math.PI, -Math.PI / 2, 0.5)).toBeCloseTo(Math.PI * 1.25)

    const route = [
      { position: new THREE.Vector3(0, 0.08, 1), rotationY: Math.PI },
      { position: new THREE.Vector3(0, 0.08, 0), rotationY: Math.PI },
      { position: new THREE.Vector3(-1, 0.08, 0), rotationY: -Math.PI / 2 },
    ]

    expect(routeRotationAtSegment(route, 1, 0.09)).toBeCloseTo(Math.PI * 1.25)
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

  it('schedules feeder queue refresh after delayed loop-entry retention expires', () => {
    const entry = {
      duration: 0.55,
      from: new THREE.Vector3(),
      startedAt: 12,
    }

    expect(passengerQueueRefreshAtForEntry(entry)).toBeCloseTo(12 + PASSENGER_LOOP_ENTRY_RETENTION_SECONDS + 0.03)
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

function makeTestCar(overrides: Partial<Car> = {}): Car {
  return {
    boarded: 0,
    capacity: 4,
    color: 'red',
    colorHidden: false,
    direction: 'right',
    id: 'car',
    length: 2,
    parkingSlotId: null,
    position: { x: 0, y: 0 },
    sequence: 0,
    status: 'field',
    tunnelId: null,
    ...overrides,
  }
}

function routeUsesLane(route: { position: THREE.Vector3 }[], laneZ: number): boolean {
  return route.some((point) => Math.abs(point.position.z - laneZ) < 0.001)
}
