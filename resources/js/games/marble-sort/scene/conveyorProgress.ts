import {
  CONVEYOR_HEIGHT,
  CONVEYOR_PERIMETER,
  CONVEYOR_WIDTH,
} from './sceneConstants'

const BASE_CONVEYOR_TICK_INTERVAL_MS = 220
const CONVEYOR_SPEED_MULTIPLIER = 1.15

export const CONVEYOR_TICK_INTERVAL_MS = Math.round(BASE_CONVEYOR_TICK_INTERVAL_MS / CONVEYOR_SPEED_MULTIPLIER)
export const CONVEYOR_PROGRESS_SPEED = 0.06 * CONVEYOR_SPEED_MULTIPLIER
export const CONVEYOR_SHIFT_DURATION = 0.18

export function conveyorSlotCountFor(capacity: number, orderLength: number): number {
  return Math.max(1, capacity, orderLength)
}

export function conveyorPhaseForTick(tick: number, slotCount: number): number {
  return tick / Math.max(1, slotCount)
}

export function conveyorProgressSpeedForSlotCount(slotCount: number): number {
  return 1 / Math.max(1, slotCount) / (CONVEYOR_TICK_INTERVAL_MS / 1000)
}

export function conveyorSlotProgress(phase: number, slotCount: number, index: number): number {
  return phase + (index / Math.max(1, slotCount))
}

export function passingSortingStackIndexForSlot(
  phase: number,
  slotCount: number,
  index: number,
  stackCount: number,
): number | undefined {
  if (stackCount < 1) {
    return undefined
  }

  return sortingStackIndexAtConveyorProgress(
    conveyorSlotProgress(phase, slotCount, index),
    stackCount,
    slotCount,
  )
}

export function sortingStackIndexAtConveyorProgress(
  progress: number,
  stackCount: number,
  slotCount: number,
): number | undefined {
  if (stackCount < 1) {
    return undefined
  }

  const dropWindow = (0.5 / Math.max(1, slotCount)) + 0.0001
  let closestIndex: number | undefined
  let closestDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < stackCount; index += 1) {
    const distance = Math.abs(centeredProgressDelta(progress - sortingStackDropProgress(index, stackCount)))
    if (distance <= dropWindow && distance < closestDistance) {
      closestIndex = index
      closestDistance = distance
    }
  }

  return closestIndex
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

function sortingStackDropProgress(index: number, total: number): number {
  const spacing = Math.min(1.18, 5.0 / Math.max(1, total))
  const left = -((total - 1) * spacing) / 2
  const stackX = left + index * spacing
  const straight = CONVEYOR_WIDTH - CONVEYOR_HEIGHT
  const conveyorLeftX = -straight / 2

  return (stackX - conveyorLeftX) / CONVEYOR_PERIMETER
}

function centeredProgressDelta(delta: number): number {
  return ((((delta + 0.5) % 1) + 1) % 1) - 0.5
}
