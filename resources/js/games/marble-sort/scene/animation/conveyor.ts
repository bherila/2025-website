import { conveyorPositionAt, fallingMarblePosition } from '../sceneGeometry'
import { type BeltMarkerRenderItem, type ConveyorRenderItem, type FallingRenderItem } from '../sceneTypes'

export function animateConveyorItems(items: ConveyorRenderItem[], phase: number): void {
  for (const item of items) {
    const spacing = item.index / Math.max(item.capacity, item.total + 1)
    item.mesh.position.copy(conveyorPositionAt(phase + spacing))
    item.mesh.rotation.x += 0.075
    item.mesh.rotation.z = -(phase + spacing) * Math.PI * 2
  }
}

export function animateConveyorBeltMarkers(items: BeltMarkerRenderItem[], phase: number): void {
  for (const item of items) {
    item.mesh.position.copy(conveyorPositionAt(phase + item.index / item.total))
    item.mesh.position.y = 0.18
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
