import { conveyorPositionAt, conveyorSlotPosition, fallingMarblePosition } from '../sceneGeometry'
import { type BeltMarkerRenderItem, type ConveyorRenderItem, type FallingRenderItem } from '../sceneTypes'

export function animateConveyorItems(items: ConveyorRenderItem[], phase: number): void {
  for (const item of items) {
    item.mesh.position.copy(conveyorSlotPosition(item.index, phase))
    item.mesh.rotation.x += 0.08
  }
}

export function animateConveyorBeltMarkers(items: BeltMarkerRenderItem[], phase: number): void {
  for (const item of items) {
    const position = conveyorPositionAt(phase + item.index / item.total)
    item.mesh.position.set(position.x, 0.18, position.z)
  }
}

export function animateFallingItems(items: FallingRenderItem[], now: number): void {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (!item) {
      continue
    }

    item.mesh.position.copy(fallingMarblePosition(item.from, index, now - item.startedAt))
  }
}
