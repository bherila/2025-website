import * as THREE from 'three'

import {
  BOX_MARBLE_COUNT,
  generateLevel,
  isBoxOpenable,
  openBox,
} from '../gameEngine'
import {
  conveyorPhaseForTick,
  conveyorSlotProgress,
  easeConveyorOffset,
  passingSortingStackIndexForSlot,
  preserveConveyorOffsetsForOrderChange,
  sortingStackDropProgress,
} from '../scene/conveyorProgress'
import { CONVEYOR_PATH_SOUTH_Z } from '../scene/sceneConstants'
import { computeOpenedBoxEvents } from '../scene/sceneEvents'
import { conveyorPositionAt, sortingStackColumnPosition } from '../scene/sceneGeometry'
import { disposeObject } from '../scene/threeUtils'

describe('MarbleSortScene conveyor animation bookkeeping', () => {
  it('keeps existing marbles in place while the belt advances to the next physical slot', () => {
    const offsets = new Map([
      ['a', 0],
      ['b', 0],
      ['c', 0],
      ['d', 0],
    ])
    const phase = conveyorPhaseForTick(4, 27)
    const nextPhase = conveyorPhaseForTick(5, 27)

    preserveConveyorOffsetsForOrderChange(
      offsets,
      ['a', 'b', 'c', 'd'],
      ['a', 'b', 'c', 'd'],
      phase,
      nextPhase,
      27,
      27,
    )

    expect(conveyorSlotProgress(nextPhase, 27, 0) + (offsets.get('a') ?? 0)).toBeCloseTo(conveyorSlotProgress(phase, 27, 0))
    expect(conveyorSlotProgress(nextPhase, 27, 1) + (offsets.get('b') ?? 0)).toBeCloseTo(conveyorSlotProgress(phase, 27, 1))
    expect(conveyorSlotProgress(nextPhase, 27, 2) + (offsets.get('c') ?? 0)).toBeCloseTo(conveyorSlotProgress(phase, 27, 2))
    expect(conveyorSlotProgress(nextPhase, 27, 3) + (offsets.get('d') ?? 0)).toBeCloseTo(conveyorSlotProgress(phase, 27, 3))
  })

  it('eases marbles into the next physical belt slot without swapping order', () => {
    const offsets = new Map([
      ['a', 0],
      ['b', 0],
      ['c', 0],
      ['d', 0],
    ])
    const phase = conveyorPhaseForTick(4, 27)
    const nextPhase = conveyorPhaseForTick(5, 27)

    preserveConveyorOffsetsForOrderChange(
      offsets,
      ['a', 'b', 'c', 'd'],
      ['a', 'b', 'c', 'd'],
      phase,
      nextPhase,
      27,
      27,
    )

    expect(offsets.get('a')).toBeCloseTo(-(1 / 27))
    expect(offsets.get('b')).toBeCloseTo(-(1 / 27))
    expect(offsets.get('c')).toBeCloseTo(-(1 / 27))
    expect(offsets.get('d')).toBeCloseTo(-(1 / 27))
    expect(easeConveyorOffset(offsets.get('a') ?? 0, 0.09)).toBeGreaterThan(offsets.get('a') ?? 0)
    expect(easeConveyorOffset(offsets.get('a') ?? 0, 0.18)).toBe(0)
  })

  it('assigns new marbles to their own canonical slots and removes exited marbles', () => {
    const offsets = new Map([
      ['a', 0],
      ['b', 0],
      ['removed', 0.12],
    ])

    preserveConveyorOffsetsForOrderChange(
      offsets,
      ['a', 'b', 'removed'],
      ['a', 'b', 'c', 'd'],
      0.25,
      0.25,
      27,
      27,
    )

    expect(offsets.get('a')).toBeCloseTo(0)
    expect(offsets.get('b')).toBeCloseTo(0)
    expect(offsets.get('c')).toBeCloseTo(0)
    expect(offsets.get('d')).toBeCloseTo(0)
    expect(offsets.has('removed')).toBe(false)
    expect(conveyorSlotProgress(0.25, 27, 2)).not.toBeCloseTo(conveyorSlotProgress(0.25, 27, 3))
  })

  it('maps conveyor drop windows to the physical Lego columns from left to right', () => {
    expect(passingSortingStackIndexForSlot(conveyorPhaseForTick(2, 27), 27, 0, 3)).toBe(0)
    expect(passingSortingStackIndexForSlot(conveyorPhaseForTick(5, 27), 27, 0, 3)).toBe(1)
    expect(passingSortingStackIndexForSlot(conveyorPhaseForTick(8, 27), 27, 0, 3)).toBe(2)
    expect(passingSortingStackIndexForSlot(conveyorPhaseForTick(0, 27), 27, 0, 3)).toBeUndefined()
  })

  it('disposes texture maps during object cleanup', () => {
    const texture = new THREE.Texture()
    const textureDispose = jest.spyOn(texture, 'dispose')
    const material = new THREE.MeshBasicMaterial({ map: texture })
    const materialDispose = jest.spyOn(material, 'dispose')
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)

    disposeObject(mesh)

    expect(textureDispose).toHaveBeenCalledTimes(1)
    expect(materialDispose).toHaveBeenCalledTimes(1)
  })

  it('reports removed boxes as burst events for the scene effect layer', () => {
    const state = generateLevel(1, 41_004)
    const box = state.boxes.find((candidate) => isBoxOpenable(candidate, state.boxes))
    if (!box) {
      throw new Error('Expected generated level to include an openable box.')
    }

    const next = openBox(state, box.id)

    expect(next.fallingMarbles).toHaveLength(BOX_MARBLE_COUNT)
    expect(computeOpenedBoxEvents(state, next)).toEqual([{
      color: box.color,
      position: box.position,
    }])
    expect(computeOpenedBoxEvents(null, next)).toEqual([])
  })

  it('drops marbles from the belt side closest to the target sorting stack', () => {
    for (let index = 0; index < 3; index += 1) {
      const dropPosition = conveyorPositionAt(sortingStackDropProgress(index, 3))
      const stackPosition = sortingStackColumnPosition(index, 3)

      expect(dropPosition.x).toBeCloseTo(stackPosition.x)
      expect(dropPosition.z).toBeCloseTo(CONVEYOR_PATH_SOUTH_Z)
    }
  })
})
