export const CONVEYOR_PROGRESS_SPEED = 0.06
export const CONVEYOR_SHIFT_DURATION = 0.18

export function conveyorSlotCountFor(capacity: number, orderLength: number): number {
  return Math.max(1, capacity, orderLength)
}

export function stabilizeConveyorPhaseForOrderChange(
  phase: number,
  previousOrder: string[],
  nextOrder: string[],
  previousSlotCount: number,
  nextSlotCount: number,
): number {
  if (previousOrder.length === 0 || nextOrder.length === 0) {
    return phase
  }

  const previousIndexById = new Map(previousOrder.map((id, index) => [id, index]))
  const anchorIndex = nextOrder.findIndex((id) => previousIndexById.has(id))
  if (anchorIndex < 0) {
    return phase
  }

  const anchorId = nextOrder[anchorIndex]
  const previousIndex = anchorId ? previousIndexById.get(anchorId) : undefined
  if (previousIndex === undefined) {
    return phase
  }

  return phase + (previousIndex / Math.max(1, previousSlotCount)) - (anchorIndex / Math.max(1, nextSlotCount))
}

export function conveyorSlotProgress(phase: number, slotCount: number, index: number): number {
  return phase + (index / Math.max(1, slotCount))
}

export function preserveConveyorOffsetsForOrderChange(
  offsetsById: Map<string, number>,
  previousOrder: string[],
  nextOrder: string[],
  previousPhase: number,
  nextPhase: number,
  previousSlotCount: number,
  nextSlotCount: number,
): void {
  const previousIndexById = new Map(previousOrder.map((id, index) => [id, index]))
  const nextIds = new Set(nextOrder)

  for (const id of offsetsById.keys()) {
    if (!nextIds.has(id)) {
      offsetsById.delete(id)
    }
  }

  for (let index = 0; index < nextOrder.length; index += 1) {
    const id = nextOrder[index]
    if (!id) {
      continue
    }

    const previousIndex = previousIndexById.get(id)
    if (previousIndex === undefined) {
      offsetsById.set(id, 0)
      continue
    }

    const previousOffset = offsetsById.get(id) ?? 0
    const previousProgress = conveyorSlotProgress(previousPhase, previousSlotCount, previousIndex) + previousOffset
    const nextProgress = conveyorSlotProgress(nextPhase, nextSlotCount, index)
    offsetsById.set(id, centeredProgressDelta(previousProgress - nextProgress))
  }
}

export function easeConveyorOffset(offset: number, deltaSeconds: number): number {
  if (offset === 0) {
    return 0
  }

  const step = deltaSeconds / CONVEYOR_SHIFT_DURATION
  if (Math.abs(offset) <= step) {
    return 0
  }

  return offset > 0 ? offset - step : offset + step
}

function centeredProgressDelta(delta: number): number {
  return ((((delta + 0.5) % 1) + 1) % 1) - 0.5
}
