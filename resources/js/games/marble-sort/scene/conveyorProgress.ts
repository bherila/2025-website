export const CONVEYOR_PROGRESS_SPEED = 0.06

export function conveyorSlotCountFor(capacity: number, orderLength: number): number {
  return Math.max(1, capacity, orderLength)
}

export function assignMissingConveyorProgress(
  progressById: Map<string, number>,
  order: string[],
  capacity: number,
  baseProgress: number,
): void {
  const slotSpacing = 1 / conveyorSlotCountFor(capacity, order.length)

  for (let index = 0; index < order.length; index += 1) {
    const id = order[index]
    if (!id || progressById.has(id)) {
      continue
    }

    progressById.set(id, progressForMissingId(progressById, order, index, slotSpacing, baseProgress))
  }
}

export function pruneConveyorProgress(progressById: Map<string, number>, activeIds: Set<string>): void {
  for (const id of progressById.keys()) {
    if (!activeIds.has(id)) {
      progressById.delete(id)
    }
  }
}

function progressForMissingId(
  progressById: Map<string, number>,
  order: string[],
  index: number,
  slotSpacing: number,
  baseProgress: number,
): number {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const id = order[cursor]
    const progress = id ? progressById.get(id) : undefined
    if (progress !== undefined) {
      return progress + ((index - cursor) * slotSpacing)
    }
  }

  for (let cursor = index + 1; cursor < order.length; cursor += 1) {
    const id = order[cursor]
    const progress = id ? progressById.get(id) : undefined
    if (progress !== undefined) {
      return progress - ((cursor - index) * slotSpacing)
    }
  }

  return baseProgress + (index * slotSpacing)
}
