import {
  centeredProgressDelta,
  CONVEYOR_ENTRY_PROGRESS,
  conveyorSlotProgress,
  sortingStackDropProgress,
} from './conveyorProgress'

export function nearestSlotIndexForProgress(
  phase: number,
  slotCount: number,
  targetProgress: number,
): number {
  const safeSlotCount = Math.max(1, slotCount)
  const normalized = (((targetProgress - phase) % 1) + 1) % 1
  return Math.round(normalized * safeSlotCount) % safeSlotCount
}

export function slotProgressDistance(
  phase: number,
  slotCount: number,
  slotIndex: number,
  targetProgress: number,
): number {
  return Math.abs(
    centeredProgressDelta(conveyorSlotProgress(phase, slotCount, slotIndex) - targetProgress),
  )
}

export function entrySlotIndexForPhase(phase: number, slotCount: number): number {
  return nearestSlotIndexForProgress(phase, slotCount, CONVEYOR_ENTRY_PROGRESS)
}

export function isSlotPassingStack(
  phase: number,
  slotCount: number,
  slotIndex: number,
  stackIndex: number,
  stackCount: number,
): boolean {
  if (stackCount < 1) {
    return false
  }

  const dropWindow = 0.5 / Math.max(1, slotCount) + 0.0001
  return (
    slotProgressDistance(phase, slotCount, slotIndex, sortingStackDropProgress(stackIndex, stackCount))
    <= dropWindow
  )
}
