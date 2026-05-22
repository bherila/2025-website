import * as THREE from 'three'

import { generateLevel } from '../gameEngine'
import {
  fitCameraToGameplayBounds,
  gameplayBoundsForState,
  type SceneFitBounds,
} from '../scene/sceneCamera'
import { fieldPositionForCar, parkingSlotPosition } from '../scene/sceneGeometry'

const VIEWPORTS = [
  { width: 390, height: 844 }, // iPhone 12/13/14
  { width: 430, height: 932 }, // iPhone 15 Pro Max
  { width: 768, height: 1024 }, // iPad portrait
  { width: 1366, height: 768 }, // desktop landscape
]

describe('sceneCamera bounds and fitting', () => {
  for (const level of [1, 2, 10, 20]) {
    it(`fits every field car and parking slot inside the padded viewport for level ${level}`, () => {
      const state = generateLevel(level, 90_000 + level)
      const bounds = gameplayBoundsForState(state, [])

      const testPoints: THREE.Vector3[] = []
      for (const car of state.cars) {
        if (car.status === 'field') {
          testPoints.push(fieldPositionForCar(car))
        }
      }
      for (const slot of state.parkingSlots) {
        if (slot.unlocked) {
          testPoints.push(parkingSlotPosition(slot.index, slot.kind))
        }
      }

      expect(testPoints.length).toBeGreaterThan(0)

      for (const { width, height } of VIEWPORTS) {
        const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200)
        fitCameraToGameplayBounds({
          camera,
          width,
          height,
          bounds,
          topPaddingPx: 16,
          bottomPaddingPx: 88,
          sidePaddingPx: 16,
        })

        for (const point of testPoints) {
          const projected = point.clone().project(camera)
          expect(projected.x).toBeGreaterThanOrEqual(-1)
          expect(projected.x).toBeLessThanOrEqual(1)
          // Leave the bottom safe area free for the absolutely positioned controls.
          const bottomLimit = -1 + (88 / height) * 2
          expect(projected.y).toBeGreaterThanOrEqual(bottomLimit - 1e-6)
          expect(projected.y).toBeLessThanOrEqual(1)
        }
      }
    })
  }

  it('keeps every bounds corner inside the padded NDC rectangle', () => {
    const bounds: SceneFitBounds = { minX: -6, maxX: 6, minZ: -8, maxZ: 4 }
    const width = 390
    const height = 844
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200)

    fitCameraToGameplayBounds({
      camera,
      width,
      height,
      bounds,
      topPaddingPx: 16,
      bottomPaddingPx: 96,
      sidePaddingPx: 16,
    })

    const sideLimit = 1 - (16 / width) * 2
    const topLimit = 1 - (16 / height) * 2
    const bottomLimit = -1 + (96 / height) * 2

    const corners = [
      new THREE.Vector3(bounds.minX, 0, bounds.minZ),
      new THREE.Vector3(bounds.maxX, 0, bounds.minZ),
      new THREE.Vector3(bounds.minX, 0, bounds.maxZ),
      new THREE.Vector3(bounds.maxX, 0, bounds.maxZ),
    ]
    for (const corner of corners) {
      const projected = corner.project(camera)
      expect(Math.abs(projected.x)).toBeLessThanOrEqual(sideLimit + 1e-3)
      expect(projected.y).toBeLessThanOrEqual(topLimit + 1e-3)
      expect(projected.y).toBeGreaterThanOrEqual(bottomLimit - 1e-3)
    }
  })

  it('includes both feeder curves in the gameplay bounds', () => {
    const state = generateLevel(5, 90_005)
    const bounds = gameplayBoundsForState(state, [])
    expect(bounds.minX).toBeLessThan(-1)
    expect(bounds.maxX).toBeGreaterThan(1)
    // Feeder curves extend below the queue loop on the negative-Z side.
    expect(bounds.minZ).toBeLessThan(-11)
  })

  it('ignores departure route endpoints when fitting bounds', () => {
    const state = generateLevel(5, 90_005)
    const baseBounds = gameplayBoundsForState(state, [])

    // A "departure" route exits the playfield far offscreen on +X / -Z.
    const farOffscreen = new THREE.Vector3(200, 0, -200)
    const onscreenStart = new THREE.Vector3(0, 0, 0)
    const departure = {
      movementKind: 'departure' as const,
      mesh: new THREE.Group(),
      route: [
        { position: onscreenStart, rotationY: 0 },
        { position: farOffscreen, rotationY: 0 },
      ],
      segmentLengths: [farOffscreen.length()],
      totalLength: farOffscreen.length(),
      startedAt: 0,
      duration: 1000,
    }
    const withDeparture = gameplayBoundsForState(state, [departure])

    expect(withDeparture.minX).toBeCloseTo(baseBounds.minX)
    expect(withDeparture.maxX).toBeCloseTo(baseBounds.maxX)
    expect(withDeparture.minZ).toBeCloseTo(baseBounds.minZ)
    expect(withDeparture.maxZ).toBeCloseTo(baseBounds.maxZ)
  })

  it('includes non-departure moving-car routes in the gameplay bounds', () => {
    const state = generateLevel(5, 90_005)
    const baseBounds = gameplayBoundsForState(state, [])

    const farPoint = new THREE.Vector3(baseBounds.maxX + 50, 0, 0)
    const parking = {
      movementKind: 'parking' as const,
      mesh: new THREE.Group(),
      route: [
        { position: new THREE.Vector3(0, 0, 0), rotationY: 0 },
        { position: farPoint, rotationY: 0 },
      ],
      segmentLengths: [farPoint.x],
      totalLength: farPoint.x,
      startedAt: 0,
      duration: 1000,
    }
    const withParking = gameplayBoundsForState(state, [parking])

    expect(withParking.maxX).toBeGreaterThan(baseBounds.maxX)
  })
})
