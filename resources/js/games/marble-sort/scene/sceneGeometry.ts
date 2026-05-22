import * as THREE from 'three'

import { type ChuteSide, type GridPosition } from '../gameEngine'
import {
  CONVEYOR_CENTER_Z,
  CONVEYOR_MARBLE_Y,
  CONVEYOR_PATH_HEIGHT,
  CONVEYOR_PATH_PERIMETER,
  CONVEYOR_PATH_RADIUS,
  CONVEYOR_PATH_WIDTH,
  CONVEYOR_SLOT_FRACTION,
  GRID_ORIGIN_X,
  GRID_ORIGIN_Z,
  GRID_STEP_X,
  GRID_STEP_Z,
  SORTING_STACK_BLOCK_STEP_Y,
  SORTING_STACK_BLOCK_STEP_Z,
  SORTING_STACK_TOP_Y,
  SORTING_STACK_Z,
} from './sceneConstants'

// Progress value on the path's north (upper) straight run, centred at x = 0.
// This is the point where the funnel throat meets the inner belt lane — every
// accepted marble enters the conveyor here, regardless of its canonical slot.
export const CONVEYOR_ENTRY_PROGRESS = (
  (CONVEYOR_PATH_WIDTH - CONVEYOR_PATH_HEIGHT) * 1.5 + Math.PI * CONVEYOR_PATH_RADIUS
) / CONVEYOR_PATH_PERIMETER

export function gridCellPosition(position: GridPosition): THREE.Vector3 {
  return new THREE.Vector3(
    GRID_ORIGIN_X + position.column * GRID_STEP_X,
    0.18,
    GRID_ORIGIN_Z + position.row * GRID_STEP_Z,
  )
}

export function chutePosition(row: number, side: ChuteSide): THREE.Vector3 {
  return new THREE.Vector3(
    side === 'left' ? GRID_ORIGIN_X - 0.78 : GRID_ORIGIN_X + GRID_STEP_X * 2 + 0.78,
    0.16,
    GRID_ORIGIN_Z + row * GRID_STEP_Z,
  )
}

export function sortingStackColumnPosition(index: number, total: number): THREE.Vector3 {
  const spacing = Math.min(1.18, 5.0 / Math.max(1, total))
  const left = -((total - 1) * spacing) / 2

  return new THREE.Vector3(left + index * spacing, 0, SORTING_STACK_Z)
}

export function sortingStackBlockOffset(depth: number): THREE.Vector3 {
  return new THREE.Vector3(
    0,
    SORTING_STACK_TOP_Y - depth * SORTING_STACK_BLOCK_STEP_Y,
    depth * SORTING_STACK_BLOCK_STEP_Z,
  )
}

export function conveyorPositionAt(progress: number): THREE.Vector3 {
  const normalized = ((progress % 1) + 1) % 1
  const straight = CONVEYOR_PATH_WIDTH - CONVEYOR_PATH_HEIGHT
  const radius = CONVEYOR_PATH_RADIUS
  const perimeter = CONVEYOR_PATH_PERIMETER
  const distance = normalized * perimeter
  const leftX = -straight / 2
  const rightX = straight / 2
  const topZ = CONVEYOR_CENTER_Z + radius
  const bottomZ = CONVEYOR_CENTER_Z - radius

  if (distance < straight) {
    return new THREE.Vector3(leftX + distance, CONVEYOR_MARBLE_Y, topZ)
  }

  if (distance < straight + Math.PI * radius) {
    const angle = Math.PI / 2 - ((distance - straight) / radius)

    return new THREE.Vector3(rightX + Math.cos(angle) * radius, CONVEYOR_MARBLE_Y, CONVEYOR_CENTER_Z + Math.sin(angle) * radius)
  }

  if (distance < straight * 2 + Math.PI * radius) {
    return new THREE.Vector3(rightX - (distance - straight - Math.PI * radius), CONVEYOR_MARBLE_Y, bottomZ)
  }

  const angle = -Math.PI / 2 - ((distance - straight * 2 - Math.PI * radius) / radius)

  return new THREE.Vector3(leftX + Math.cos(angle) * radius, CONVEYOR_MARBLE_Y, CONVEYOR_CENTER_Z + Math.sin(angle) * radius)
}

export function conveyorSlotPosition(index: number, phase: number, slotCount = 0): THREE.Vector3 {
  const slotFraction = slotCount > 0 ? 1 / slotCount : CONVEYOR_SLOT_FRACTION

  return conveyorPositionAt(phase + index * slotFraction)
}
