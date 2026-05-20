import * as THREE from 'three'

import { type ChuteSide, GRID_COLUMNS, type GridPosition } from '../gameEngine'
import {
  CONVEYOR_CENTER_Z,
  CONVEYOR_HEIGHT,
  CONVEYOR_WIDTH,
  GRID_ORIGIN_X,
  GRID_ORIGIN_Z,
  GRID_STEP_X,
  GRID_STEP_Z,
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

export function sortingStackPosition(index: number, total: number): THREE.Vector3 {
  const spacing = Math.min(1.15, 5.2 / Math.max(1, total))
  const left = -((total - 1) * spacing) / 2

  return new THREE.Vector3(left + index * spacing, 0.2, SORTING_STACK_Z)
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
    return new THREE.Vector3(leftX + distance, 0.36, topZ)
  }

  if (distance < straight + Math.PI * radius) {
    const angle = Math.PI / 2 - ((distance - straight) / radius)

    return new THREE.Vector3(rightX + Math.cos(angle) * radius, 0.36, CONVEYOR_CENTER_Z + Math.sin(angle) * radius)
  }

  if (distance < straight * 2 + Math.PI * radius) {
    return new THREE.Vector3(rightX - (distance - straight - Math.PI * radius), 0.36, bottomZ)
  }

  const angle = -Math.PI / 2 - ((distance - straight * 2 - Math.PI * radius) / radius)

  return new THREE.Vector3(leftX + Math.cos(angle) * radius, 0.36, CONVEYOR_CENTER_Z + Math.sin(angle) * radius)
}

export function fallingMarblePosition(from: GridPosition, index: number, elapsed: number): THREE.Vector3 {
  const source = gridCellPosition(from)
  const rowBand = Math.floor(index / 3)
  const laneOffset = ((index % 3) - 1) * 0.16
  const stagger = rowBand * 0.08
  const progress = easeOutCubic(Math.min(1, Math.max(0, (elapsed - stagger) / 1.05)))
  const funnelX = (from.column - (GRID_COLUMNS - 1) / 2) * 0.2 + laneOffset
  const landingX = laneOffset + ((index % 2) === 0 ? -0.08 : 0.08)
  const midway = Math.min(1, progress / 0.62)
  const finish = Math.max(0, (progress - 0.62) / 0.38)
  const x = source.x + (funnelX - source.x) * midway + (landingX - funnelX) * finish
  const z = source.z + (CONVEYOR_CENTER_Z - 0.55 - source.z) * midway + (CONVEYOR_CENTER_Z + 0.38 - (CONVEYOR_CENTER_Z - 0.55)) * finish
  const arc = Math.sin(progress * Math.PI) * 0.7
  const bounce = Math.sin(Math.max(0, finish) * Math.PI * 2) * 0.06 * (1 - finish)

  return new THREE.Vector3(x, 0.32 + arc + bounce, z)
}

function easeOutCubic(value: number): number {
  return 1 - ((1 - value) ** 3)
}
