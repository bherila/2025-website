import * as THREE from 'three'

import {
  BOX_MARBLE_COUNT,
  generateLevel,
  isBoxOpenable,
  openBox,
} from '../gameEngine'
import { animateConveyorBeltMarkers } from '../scene/animation/conveyor'
import { createConveyorBeltMarkers } from '../scene/builders/conveyorTrack'
import {
  conveyorPhaseForTick,
  conveyorSlotProgress,
  passingSortingStackIndexForSlot,
  sortingStackDropProgress,
} from '../scene/conveyorProgress'
import { CONVEYOR_PATH_SOUTH_Z } from '../scene/sceneConstants'
import { computeOpenedBoxEvents } from '../scene/sceneEvents'
import { conveyorPositionAt, sortingStackColumnPosition } from '../scene/sceneGeometry'
import { disposeObject } from '../scene/threeUtils'

describe('MarbleSortScene rendering bookkeeping', () => {
  it('maps conveyor drop windows to the physical Lego columns from left to right', () => {
    // The third argument is a physical slot index. With phase advancing per
    // tick and slotIndex 0, the slot rotates through stack 0, 1, 2 as ticks
    // accumulate. These exact tick values were chosen for the 27-slot belt.
    expect(passingSortingStackIndexForSlot(conveyorPhaseForTick(2, 27), 27, 0, 3)).toBe(0)
    expect(passingSortingStackIndexForSlot(conveyorPhaseForTick(5, 27), 27, 0, 3)).toBe(1)
    expect(passingSortingStackIndexForSlot(conveyorPhaseForTick(8, 27), 27, 0, 3)).toBe(2)
    expect(passingSortingStackIndexForSlot(conveyorPhaseForTick(0, 27), 27, 0, 3)).toBeUndefined()
  })

  it('renders belt markers and conveyor marbles from the same slot progress', () => {
    const slotCount = 27
    const slotIndex = 19
    const phase = conveyorPhaseForTick(7, slotCount)

    const { markers, group } = createConveyorBeltMarkers(slotCount)
    animateConveyorBeltMarkers(markers, phase)
    const marker = markers.find((item) => item.index === slotIndex)
    const marblePosition = conveyorPositionAt(conveyorSlotProgress(phase, slotCount, slotIndex))

    expect(marker).toBeDefined()
    expect(marker?.mesh.position.x).toBeCloseTo(marblePosition.x)
    expect(marker?.mesh.position.z).toBeCloseTo(marblePosition.z)

    disposeObject(group)
  })

  it('rebuilds belt markers when conveyor capacity grows', () => {
    const initial = createConveyorBeltMarkers(27)
    expect(initial.markers).toHaveLength(27)

    disposeObject(initial.group)

    const extended = createConveyorBeltMarkers(36)
    expect(extended.markers).toHaveLength(36)
    expect(extended.markers.every((marker) => marker.total === 36)).toBe(true)

    disposeObject(extended.group)
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
