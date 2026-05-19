import * as THREE from 'three'

import { CAR_COLORS, CAR_PATTERN_VALUES, CAR_PATTERNS } from '../gameTypes'
import { animatePassengers } from '../scene/animation/passengers'
import {
  createPassengerInstanceHandle,
  createPassengerInstancePools,
  passengerInstancePoolMeshes,
} from '../scene/builders/passengerMesh'
import type { PassengerRenderItem, QueueLayout } from '../scene/sceneTypes'

describe('Parking Pickup passenger rendering', () => {
  it('assigns one colorblind pattern per car color', () => {
    const patterns = Object.values(CAR_PATTERNS)

    expect(patterns).toHaveLength(Object.keys(CAR_COLORS).length)
    expect(new Set(patterns).size).toBe(patterns.length)
    expect(new Set(CAR_PATTERN_VALUES)).toEqual(new Set(patterns))
  })

  it('allocates passenger instance handles and animates their matrices', () => {
    const pools = createPassengerInstancePools(2)
    const handle = createPassengerInstanceHandle(pools, CAR_COLORS.red.hex)
    const layout: QueueLayout = {
      capRadius: 1,
      depth: 2.7,
      halfDepth: 1,
      halfWidth: 1,
      perimeter: 2 + Math.PI * 2,
      straightLength: 2,
      width: 4.7,
    }
    const passenger: PassengerRenderItem = {
      id: 'passenger-1',
      layout,
      mesh: handle,
      offset: 0,
    }

    animatePassengers([passenger], 0, 0)

    const color = new THREE.Color()
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    pools.headMesh.getColorAt(0, color)
    pools.headMesh.getMatrixAt(0, matrix)
    matrix.decompose(position, quaternion, scale)

    expect(passengerInstancePoolMeshes(pools)).toHaveLength(2)
    expect(pools.used).toBe(1)
    expect(pools.headMesh.count).toBe(1)
    expect(pools.bodyMesh.count).toBe(1)
    expect(`#${color.getHexString()}`).toBe(CAR_COLORS.red.hex)
    expect(position.y).toBeCloseTo(0.57)
  })
})
