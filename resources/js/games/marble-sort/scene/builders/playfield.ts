import * as THREE from 'three'

import {
  BASIN_EXIT_HALF_WIDTH,
  BASIN_NORTH_Z,
  BASIN_SOUTH_Z,
  BASIN_TOP_HALF_WIDTH,
  GRID_CELL_GAP,
  GRID_CELL_SIZE,
  GRID_ORIGIN_X,
  GRID_ORIGIN_Z,
  GRID_STEP_X,
  GRID_STEP_Z,
  SORTING_STACK_Z,
} from '../sceneConstants'
import { createCanvasPlane } from '../threeUtils'

const TOP_TRAY_WIDTH = 7.2
const TOP_TRAY_NORTH_Z = -3.25
// Top tray's south edge coincides with the basin's south edge — the V-notch in
// the bottom border *is* the funnel chute opening above the conveyor.
const TOP_TRAY_SOUTH_Z = BASIN_SOUTH_Z
const TOP_TRAY_DEPTH = TOP_TRAY_SOUTH_Z - TOP_TRAY_NORTH_Z
const TOP_TRAY_CENTER_Z = (TOP_TRAY_NORTH_Z + TOP_TRAY_SOUTH_Z) / 2
const BOTTOM_TRAY_WIDTH = 7.2
const BOTTOM_TRAY_NORTH_Z = SORTING_STACK_Z - 1.05
const BOTTOM_TRAY_SOUTH_Z = SORTING_STACK_Z + 2.0
const BOTTOM_TRAY_DEPTH = BOTTOM_TRAY_SOUTH_Z - BOTTOM_TRAY_NORTH_Z
const BOTTOM_TRAY_CENTER_Z = (BOTTOM_TRAY_NORTH_Z + BOTTOM_TRAY_SOUTH_Z) / 2

export function createPlayfield(): THREE.Group {
  const group = new THREE.Group()

  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 22),
    new THREE.MeshBasicMaterial({ color: '#54c074' }),
  )
  grass.rotation.x = -Math.PI / 2
  grass.position.set(0, -0.06, 0)
  group.add(grass)

  const topTray = createCanvasPlane(TOP_TRAY_WIDTH, TOP_TRAY_DEPTH, drawTopTray)
  topTray.position.set(0, 0, TOP_TRAY_CENTER_Z)
  group.add(topTray)

  const bottomTray = createCanvasPlane(BOTTOM_TRAY_WIDTH, BOTTOM_TRAY_DEPTH, drawBottomTray)
  bottomTray.position.set(0, 0, BOTTOM_TRAY_CENTER_Z)
  group.add(bottomTray)

  // Plate sized exactly to the 3x5 grid of cells — anything larger would jut
  // south and occlude the painted funnel below the grid.
  const gridPlate = new THREE.Mesh(
    new THREE.BoxGeometry(3.85, 0.08, GRID_STEP_Z * 4 + GRID_CELL_SIZE),
    new THREE.MeshStandardMaterial({ color: '#e3eaf5', roughness: 0.55 }),
  )
  gridPlate.position.set(0, 0.02, GRID_ORIGIN_Z + GRID_STEP_Z * 2)
  gridPlate.receiveShadow = true
  group.add(gridPlate)

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const cell = new THREE.Mesh(
        new THREE.BoxGeometry(GRID_CELL_SIZE - GRID_CELL_GAP, 0.06, GRID_CELL_SIZE - GRID_CELL_GAP),
        new THREE.MeshStandardMaterial({ color: '#f1f4fb', roughness: 0.6 }),
      )
      cell.position.set(GRID_ORIGIN_X + column * GRID_STEP_X, 0.09, GRID_ORIGIN_Z + row * GRID_STEP_Z)
      cell.receiveShadow = true
      group.add(cell)
    }
  }

  return group
}

function drawBottomTray(context: CanvasRenderingContext2D, w: number, h: number): void {
  drawTrayFrame(context, w, h, '#cce4cd', '#368754')
}

function drawTopTray(context: CanvasRenderingContext2D, w: number, h: number): void {
  context.clearRect(0, 0, w, h)

  const inset = 18
  const r = 78
  const fill = '#dceedd'
  const wall = '#368754'

  // Where the funnel walls meet the side edges of the rectangle (start of the V notch).
  const shoulderY = worldZToPixelTop(BASIN_NORTH_Z, h)
  // The funnel exit reaches the canvas south edge so the green walls visually
  // continue straight onto the conveyor housing below.
  const exitY = h - 4
  const halfWidthTop = (BASIN_TOP_HALF_WIDTH / TOP_TRAY_WIDTH) * w
  const halfWidthBot = (BASIN_EXIT_HALF_WIDTH / TOP_TRAY_WIDTH) * w
  const cx = w / 2

  // Build the closed outer shape: rounded rect on top, V-shaped notch in the
  // bottom edge that opens directly above the conveyor below the tray.
  const buildShape = (): void => {
    context.beginPath()
    context.moveTo(inset + r, inset)
    context.lineTo(w - inset - r, inset)
    context.quadraticCurveTo(w - inset, inset, w - inset, inset + r)
    context.lineTo(w - inset, shoulderY)
    // Right shoulder of the bottom edge.
    context.lineTo(cx + halfWidthTop, shoulderY)
    // Right funnel wall curving inward and down to the narrow exit.
    context.bezierCurveTo(
      cx + halfWidthTop - 6, shoulderY + (exitY - shoulderY) * 0.5,
      cx + halfWidthBot + 18, exitY - 22,
      cx + halfWidthBot, exitY,
    )
    // Exit opening (this edge is filled but the green border is not stroked here).
    context.lineTo(cx - halfWidthBot, exitY)
    // Left funnel wall curving outward back up to the left shoulder.
    context.bezierCurveTo(
      cx - halfWidthBot - 18, exitY - 22,
      cx - halfWidthTop + 6, shoulderY + (exitY - shoulderY) * 0.5,
      cx - halfWidthTop, shoulderY,
    )
    // Left shoulder of the bottom edge.
    context.lineTo(inset, shoulderY)
    context.lineTo(inset, inset + r)
    context.quadraticCurveTo(inset, inset, inset + r, inset)
    context.closePath()
  }

  buildShape()
  context.fillStyle = fill
  context.fill()

  // Stroke the border in two arcs so the exit opening at the bottom of the V
  // stays clean (no border across the conveyor drop slot).
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = wall
  context.lineWidth = 30

  context.beginPath()
  context.moveTo(inset + r, inset)
  context.lineTo(w - inset - r, inset)
  context.quadraticCurveTo(w - inset, inset, w - inset, inset + r)
  context.lineTo(w - inset, shoulderY)
  context.lineTo(cx + halfWidthTop, shoulderY)
  context.bezierCurveTo(
    cx + halfWidthTop - 6, shoulderY + (exitY - shoulderY) * 0.5,
    cx + halfWidthBot + 18, exitY - 22,
    cx + halfWidthBot, exitY,
  )
  context.stroke()

  context.beginPath()
  context.moveTo(cx - halfWidthBot, exitY)
  context.bezierCurveTo(
    cx - halfWidthBot - 18, exitY - 22,
    cx - halfWidthTop + 6, shoulderY + (exitY - shoulderY) * 0.5,
    cx - halfWidthTop, shoulderY,
  )
  context.lineTo(inset, shoulderY)
  context.lineTo(inset, inset + r)
  context.quadraticCurveTo(inset, inset, inset + r, inset)
  context.stroke()

  // Top-edge specular highlight.
  context.globalAlpha = 0.42
  context.fillStyle = '#ffffff'
  roundedRect(context, inset + 26, inset + 18, w - (inset + 26) * 2, h * 0.045, 40)
  context.fill()
  context.globalAlpha = 1
}

function drawTrayFrame(context: CanvasRenderingContext2D, w: number, h: number, fill: string, wall: string): void {
  context.clearRect(0, 0, w, h)

  const borderInset = 18
  const borderRadius = 78

  context.fillStyle = fill
  roundedRect(context, borderInset, borderInset, w - borderInset * 2, h - borderInset * 2, borderRadius)
  context.fill()

  context.strokeStyle = wall
  context.lineWidth = 30
  roundedRect(context, borderInset, borderInset, w - borderInset * 2, h - borderInset * 2, borderRadius)
  context.stroke()

  // Light specular highlight along the top edge so the tray reads as plastic.
  context.globalAlpha = 0.42
  context.fillStyle = '#ffffff'
  roundedRect(context, borderInset + 26, borderInset + 18, w - (borderInset + 26) * 2, h * 0.07, 40)
  context.fill()
  context.globalAlpha = 1
}

function worldZToPixelTop(worldZ: number, pixelHeight: number): number {
  return ((worldZ - TOP_TRAY_NORTH_Z) / TOP_TRAY_DEPTH) * pixelHeight
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  context.beginPath()
  context.moveTo(x + r, y)
  context.lineTo(x + w - r, y)
  context.quadraticCurveTo(x + w, y, x + w, y + r)
  context.lineTo(x + w, y + h - r)
  context.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  context.lineTo(x + r, y + h)
  context.quadraticCurveTo(x, y + h, x, y + h - r)
  context.lineTo(x, y + r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.closePath()
}

