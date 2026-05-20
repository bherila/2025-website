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
} from '../sceneConstants'
import { createCanvasPlane } from '../threeUtils'

const TRAY_WIDTH = 6.6
const TRAY_NORTH_Z = -3.4
const TRAY_SOUTH_Z = BASIN_SOUTH_Z + 0.18
const TRAY_DEPTH = TRAY_SOUTH_Z - TRAY_NORTH_Z
const TRAY_CENTER_Z = (TRAY_NORTH_Z + TRAY_SOUTH_Z) / 2

export function createPlayfield(): THREE.Group {
  const group = new THREE.Group()

  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 18),
    new THREE.MeshBasicMaterial({ color: '#54c074' }),
  )
  grass.rotation.x = -Math.PI / 2
  grass.position.set(0, -0.06, 0)
  group.add(grass)

  const tray = createCanvasPlane(TRAY_WIDTH, TRAY_DEPTH, drawTray)
  tray.position.set(0, 0, TRAY_CENTER_Z)
  group.add(tray)

  const gridPlate = new THREE.Mesh(
    new THREE.BoxGeometry(3.85, 0.08, 4.7),
    new THREE.MeshStandardMaterial({ color: '#e3eaf5', roughness: 0.55, transparent: true, opacity: 0.65 }),
  )
  gridPlate.position.set(0, 0.02, GRID_ORIGIN_Z + GRID_STEP_Z * 2)
  gridPlate.receiveShadow = true
  group.add(gridPlate)

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const cell = new THREE.Mesh(
        new THREE.BoxGeometry(GRID_CELL_SIZE - GRID_CELL_GAP, 0.06, GRID_CELL_SIZE - GRID_CELL_GAP),
        new THREE.MeshStandardMaterial({ color: '#f1f4fb', roughness: 0.6, transparent: true, opacity: 0.95 }),
      )
      cell.position.set(GRID_ORIGIN_X + column * GRID_STEP_X, 0.09, GRID_ORIGIN_Z + row * GRID_STEP_Z)
      cell.receiveShadow = true
      group.add(cell)
    }
  }

  return group
}

function drawTray(context: CanvasRenderingContext2D, w: number, h: number): void {
  context.clearRect(0, 0, w, h)

  const fillColor = '#dceedd'
  const wallColor = '#368754'
  const borderRadius = 84
  const borderInset = 18

  context.fillStyle = fillColor
  roundedRect(context, borderInset, borderInset, w - borderInset * 2, h - borderInset * 2, borderRadius)
  context.fill()

  context.globalAlpha = 0.5
  context.fillStyle = '#ffffff'
  roundedRect(context, borderInset + 22, borderInset + 16, w - (borderInset + 22) * 2, h * 0.06, 38)
  context.fill()
  context.globalAlpha = 1

  const pxNorth = worldZToPixel(BASIN_NORTH_Z, h)
  const pxSouth = worldZToPixel(BASIN_SOUTH_Z, h)
  const pxTopHalf = (BASIN_TOP_HALF_WIDTH / TRAY_WIDTH) * w
  const pxExitHalf = (BASIN_EXIT_HALF_WIDTH / TRAY_WIDTH) * w
  const cxLeftTop = w / 2 - pxTopHalf
  const cxRightTop = w / 2 + pxTopHalf
  const cxLeftExit = w / 2 - pxExitHalf
  const cxRightExit = w / 2 + pxExitHalf

  context.lineJoin = 'round'
  context.lineCap = 'round'

  context.strokeStyle = wallColor
  context.lineWidth = 30
  roundedRectStrokeWithExit(context, borderInset, borderInset, w - borderInset * 2, h - borderInset * 2, borderRadius, cxLeftExit, cxRightExit)

  context.strokeStyle = wallColor
  context.lineWidth = 26
  context.beginPath()
  context.moveTo(cxLeftTop, pxNorth)
  context.bezierCurveTo(
    cxLeftTop - 4, pxNorth + (pxSouth - pxNorth) * 0.45,
    cxLeftExit + 36, pxSouth - 38,
    cxLeftExit, pxSouth + 14,
  )
  context.stroke()

  context.beginPath()
  context.moveTo(cxRightTop, pxNorth)
  context.bezierCurveTo(
    cxRightTop + 4, pxNorth + (pxSouth - pxNorth) * 0.45,
    cxRightExit - 36, pxSouth - 38,
    cxRightExit, pxSouth + 14,
  )
  context.stroke()

  context.fillStyle = wallColor
  context.beginPath()
  context.arc(cxLeftExit, pxSouth + 14, 14, 0, Math.PI * 2)
  context.fill()
  context.beginPath()
  context.arc(cxRightExit, pxSouth + 14, 14, 0, Math.PI * 2)
  context.fill()
}

function worldZToPixel(worldZ: number, pixelHeight: number): number {
  return ((worldZ - TRAY_NORTH_Z) / TRAY_DEPTH) * pixelHeight
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

function roundedRectStrokeWithExit(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  exitLeft: number,
  exitRight: number,
): void {
  context.beginPath()
  context.moveTo(x + r, y)
  context.lineTo(x + w - r, y)
  context.quadraticCurveTo(x + w, y, x + w, y + r)
  context.lineTo(x + w, y + h - r)
  context.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  context.lineTo(exitRight, y + h)
  context.stroke()

  context.beginPath()
  context.moveTo(exitLeft, y + h)
  context.lineTo(x + r, y + h)
  context.quadraticCurveTo(x, y + h, x, y + h - r)
  context.lineTo(x, y + r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.stroke()
}
