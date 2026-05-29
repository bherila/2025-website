import * as THREE from 'three'

import { CAR_COLORS, CAR_PATTERN_VALUES, CAR_PATTERNS } from '../gameTypes'
import { animatePassengers } from '../scene/animation/passengers'
import {
  createPassengerInstanceHandle,
  createPassengerInstancePools,
  PASSENGER_HEAD_Y_OFFSET,
  passengerInstancePoolMeshes,
} from '../scene/builders/passengerMesh'
import {
  passengerQueueLaneOffset,
  queuePosition,
  queueVisualPosition,
} from '../scene/sceneGeometry'
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
      laneOffset: passengerQueueLaneOffset('passenger-1'),
      layout,
      mesh: handle,
      offset: 0,
    }

    animatePassengers([passenger], 0, 0)

    const color = new THREE.Color()
    const vertexColor = pools.headMesh.geometry.getAttribute('color')
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
    expect(Array.from(vertexColor.array.slice(0, 3))).toEqual([1, 1, 1])
    expect(`#${color.getHexString()}`).toBe(CAR_COLORS.red.hex)
    expect(position.y).toBeCloseTo(0.12 + PASSENGER_HEAD_Y_OFFSET)
  })

  it('tweens a loop shift in offset space so it tracks the rotating loop, not a frozen point', () => {
    const layout: QueueLayout = {
      capRadius: 1,
      depth: 2.7,
      halfDepth: 1,
      halfWidth: 2,
      perimeter: 4 * 2 + Math.PI * 2,
      straightLength: 4,
      width: 4.7,
    }
    const phase = 1.3
    const fromOffset = 0.6
    const mesh = new THREE.Group()
    const passenger: PassengerRenderItem = {
      entry: {
        // A deliberately stale world point. If the shift froze `from` (the old bug),
        // the passenger would snap here at progress 0 instead of following the loop.
        from: new THREE.Vector3(-99, 0.12, -99),
        fromOffset,
        startedAt: performance.now() / 1000 + 100,
        duration: 0.3,
      },
      id: 'shift-1',
      layout,
      mesh,
      offset: 0,
    }

    animatePassengers([passenger], phase, 0)

    // progress clamps to 0 (startedAt is in the future) → position must equal the live
    // loop sample at phase + fromOffset, proving the tween rotates with the phase.
    const expected = queueVisualPosition(phase + fromOffset, layout, 0)
    expect(mesh.position.x).toBeCloseTo(expected.x)
    expect(mesh.position.z).toBeCloseTo(expected.z)
    expect(mesh.position.distanceTo(new THREE.Vector3(-99, 0.12, -99))).toBeGreaterThan(1)
  })

  it('keeps queue lane offsets deterministic and visual-only', () => {
    const layout: QueueLayout = {
      capRadius: 1,
      depth: 2.7,
      halfDepth: 1,
      halfWidth: 2,
      perimeter: 4 * 2 + Math.PI * 2,
      straightLength: 4,
      width: 4.7,
    }
    const logical = queuePosition(0, layout)
    const laneOffset = passengerQueueLaneOffset('passenger-1')
    const visual = queueVisualPosition(0, layout, laneOffset)

    expect(passengerQueueLaneOffset('passenger-1')).toBe(laneOffset)
    expect(Math.abs(laneOffset)).toBeLessThanOrEqual(0.16)
    expect(visual.distanceTo(logical)).toBeCloseTo(Math.abs(laneOffset))
  })
})
