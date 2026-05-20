import { conveyorPositionAt, fallingMarblePosition } from '../sceneGeometry'
import { type ConveyorRenderItem, type FallingRenderItem } from '../sceneTypes'

export function animateConveyorItems(items: ConveyorRenderItem[], phase: number): void {
  for (const item of items) {
    const spacing = item.total > 0 ? item.index / Math.max(8, item.total + 5) : 0
    item.mesh.position.copy(conveyorPositionAt(phase + spacing))
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
