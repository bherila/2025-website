import { conveyorPositionAt, conveyorSlotPosition } from '../sceneGeometry'
import { type BeltMarkerRenderItem, type ConveyorRenderItem } from '../sceneTypes'

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
