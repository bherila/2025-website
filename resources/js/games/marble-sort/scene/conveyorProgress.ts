import {
  CONVEYOR_PATH_HEIGHT,
  CONVEYOR_PATH_PERIMETER,
  CONVEYOR_PATH_RADIUS,
  CONVEYOR_PATH_WIDTH,
} from './sceneConstants'

// Progress value on the path's north (upper) straight run, centred at x = 0.
// This is the point where the funnel throat meets the inner belt lane — every
// accepted marble enters the conveyor here, regardless of its canonical slot.
export const CONVEYOR_ENTRY_PROGRESS = (
  (CONVEYOR_PATH_WIDTH - CONVEYOR_PATH_HEIGHT) * 1.5 + Math.PI * CONVEYOR_PATH_RADIUS
) / CONVEYOR_PATH_PERIMETER

const BASE_CONVEYOR_TICK_INTERVAL_MS = 220
const CONVEYOR_SPEED_MULTIPLIER = 1.15

export const CONVEYOR_TICK_INTERVAL_MS = Math.round(BASE_CONVEYOR_TICK_INTERVAL_MS / CONVEYOR_SPEED_MULTIPLIER)

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

export function sortingStackDropProgress(index: number, total: number): number {
  const spacing = Math.min(1.18, 5.0 / Math.max(1, total))
  const left = -((total - 1) * spacing) / 2
  const stackX = left + index * spacing
  const straight = CONVEYOR_PATH_WIDTH - CONVEYOR_PATH_HEIGHT
  const conveyorLeftX = -straight / 2

  return (stackX - conveyorLeftX) / CONVEYOR_PATH_PERIMETER
}

export function centeredProgressDelta(delta: number): number {
  return ((((delta + 0.5) % 1) + 1) % 1) - 0.5
}
