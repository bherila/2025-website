import * as THREE from 'three'

import { retainPersistentMovingCars } from '../CarsScene'
import { generateLevel, loopPassengerCapacity } from '../gameEngine'
import { passengerSpacing, queueLayoutForState } from '../scene/sceneGeometry'

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

  it('sizes the loop near the active passenger buffer', () => {
    const state = generateLevel(5, 20_005)
    const readyPassengers = loopPassengerCapacity(state)
    const layout = queueLayoutForState(state)

    expect(layout.perimeter).toBeLessThanOrEqual(readyPassengers * passengerSpacing() + passengerSpacing() * 4)
  })
})
