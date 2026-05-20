import * as THREE from 'three'

import { type ChuteSide, type GridPosition } from '../gameEngine'
import {
  CONVEYOR_CENTER_Z,
  CONVEYOR_HEIGHT,
  CONVEYOR_MARBLE_Y,
  CONVEYOR_SLOT_FRACTION,
  CONVEYOR_WIDTH,
  FUNNEL_MOUTH_Y,
  FUNNEL_MOUTH_Z,
  GRID_ORIGIN_X,
  GRID_ORIGIN_Z,
  GRID_STEP_X,
  GRID_STEP_Z,
  SORTING_STACK_BLOCK_STEP_Y,
  SORTING_STACK_BLOCK_STEP_Z,
  SORTING_STACK_TOP_Y,
  SORTING_STACK_Z,
} from './sceneConstants'

export function gridCellPosition(position: GridPosition): THREE.Vector3 {
  return new THREE.Vector3(
    GRID_ORIGIN_X + position.column * GRID_STEP_X,
    0.18,
    GRID_ORIGIN_Z + position.row * GRID_STEP_Z,
  )
}

export function chutePosition(row: number, side: ChuteSide): THREE.Vector3 {
  return new THREE.Vector3(
    side === 'left' ? GRID_ORIGIN_X - 1.25 : GRID_ORIGIN_X + GRID_STEP_X * 2 + 1.25,
    0.22,
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

export function funnelMouthPosition(column: number): THREE.Vector3 {
  return new THREE.Vector3(
    GRID_ORIGIN_X + column * GRID_STEP_X,
    FUNNEL_MOUTH_Y,
    FUNNEL_MOUTH_Z,
  )
}

export function conveyorPositionAt(progress: number): THREE.Vector3 {
  const normalized = ((progress % 1) + 1) % 1
  const straight = CONVEYOR_WIDTH - CONVEYOR_HEIGHT
  const radius = CONVEYOR_HEIGHT / 2
  const perimeter = straight * 2 + Math.PI * CONVEYOR_HEIGHT
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

export function conveyorSlotPosition(index: number, phase: number): THREE.Vector3 {
  return conveyorPositionAt(phase + index * CONVEYOR_SLOT_FRACTION)
}

export function fallingMarblePosition(from: GridPosition, index: number, elapsed: number): THREE.Vector3 {
  const source = gridCellPosition(from)
  const mouth = funnelMouthPosition(from.column)
  const stagger = index * 0.05
  const dropDuration = 0.55
  const slideDuration = 0.45
  const rawTime = Math.max(0, elapsed - stagger)
  const dropT = Math.min(1, rawTime / dropDuration)
  const slideT = Math.min(1, Math.max(0, rawTime - dropDuration) / slideDuration)

  const lateralWobble = ((index % 3) - 1) * 0.08
  const stage1X = source.x + (mouth.x - source.x) * easeInQuad(dropT) + lateralWobble * dropT
  const stage1Z = source.z + (mouth.z - source.z) * easeInQuad(dropT)
  const stage1Y = source.y + 0.1 + (mouth.y + 0.18 - source.y) * easeInQuad(dropT) - dropT * dropT * 0.05

  const finalX = mouth.x + ((index % 5) - 2) * 0.06
  const finalZ = CONVEYOR_CENTER_Z + 0.02
  const stage2X = stage1X + (finalX - stage1X) * easeOutCubic(slideT)
  const stage2Z = stage1Z + (finalZ - stage1Z) * easeOutCubic(slideT)
  const bounce = Math.max(0, Math.sin(slideT * Math.PI)) * 0.18
  const settleY = CONVEYOR_MARBLE_Y + 0.02
  const stage2Y = stage1Y + (settleY - stage1Y) * easeOutCubic(slideT) + bounce * (1 - slideT * 0.5)

  return new THREE.Vector3(stage2X, stage2Y, stage2Z)
}

function easeOutCubic(value: number): number {
  return 1 - ((1 - value) ** 3)
}

function easeInQuad(value: number): number {
  return value * value
}
