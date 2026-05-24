import * as THREE from 'three'

import type { GameState } from '../../gameEngine'
import { INCOMING_LANE_Z, OUTGOING_LANE_Z, PARKING_SLOT_TILT, PARKING_Z } from '../sceneConstants'
import { parkingSlotPosition } from '../sceneGeometry'
import { createTextLabelMesh } from '../threeUtils'

const ASPHALT_WIDTH = 24.0
const ASPHALT_DEPTH = 3.25
const ASPHALT_CENTER_Z = PARKING_Z
const APRON_CURB_PAD = 0.3

export const PARKING_APRON_FIELD_EDGE_Z = ASPHALT_CENTER_Z + (ASPHALT_DEPTH + APRON_CURB_PAD) / 2

export function createParkingRow(state: GameState): THREE.Object3D {
  const group = new THREE.Group()

  const curbShape = parkingApronShape(ASPHALT_WIDTH + APRON_CURB_PAD, ASPHALT_DEPTH + APRON_CURB_PAD)
  const curb = new THREE.Mesh(
    new THREE.ExtrudeGeometry(curbShape, { depth: 0.045, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: '#e7edf7', roughness: 0.58 }),
  )
  curb.rotation.x = -Math.PI / 2
  curb.position.set(0, 0.045, ASPHALT_CENTER_Z)
  curb.receiveShadow = true
  group.add(curb)

  const asphaltShape = parkingApronShape(ASPHALT_WIDTH, ASPHALT_DEPTH)
  const asphalt = new THREE.Mesh(
    new THREE.ExtrudeGeometry(asphaltShape, { depth: 0.06, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: '#667386', roughness: 0.8 }),
  )
  asphalt.rotation.x = -Math.PI / 2
  asphalt.position.set(0, 0.07, ASPHALT_CENTER_Z)
  asphalt.receiveShadow = true
  group.add(asphalt)

  const laneDivider = makeLaneDivider()
  laneDivider.position.set(0, 0.12, (INCOMING_LANE_Z + OUTGOING_LANE_Z) / 2)
  group.add(laneDivider)

  for (const slot of state.parkingSlots) {
    const position = parkingSlotPosition(slot.index, slot.kind)
    const slotWidth = 0.98
    const slotDepth = 1.86
    const tiltAngle = PARKING_SLOT_TILT

    const slotShape = roundedRectShape(slotWidth, slotDepth, 0.18)
    const fillColor = slot.kind === 'vip'
      ? '#facc15'
      : slot.unlocked
        ? '#8a96ab'
        : '#5b6675'
    const slotBase = new THREE.Mesh(
      new THREE.ExtrudeGeometry(slotShape, { depth: 0.025, bevelEnabled: false }),
      new THREE.MeshBasicMaterial({ color: fillColor }),
    )
    slotBase.rotation.x = -Math.PI / 2
    slotBase.rotation.z = tiltAngle
    slotBase.position.set(position.x, 0.115, position.z)
    slotBase.receiveShadow = true
    group.add(slotBase)

    const outlineColor = slot.kind === 'vip'
      ? '#a16207'
      : slot.unlocked
        ? '#dbe6f1'
        : '#8793a4'
    const outline = makeRoundedRectOutline(slotWidth, slotDepth, 0.18, 0.06)
    const outlineMesh = new THREE.Mesh(
      outline,
      new THREE.MeshBasicMaterial({ color: outlineColor }),
    )
    outlineMesh.rotation.x = -Math.PI / 2
    outlineMesh.rotation.z = tiltAngle
    outlineMesh.position.set(position.x, 0.145, position.z)
    group.add(outlineMesh)

    if (slot.kind === 'vip') {
      const vip = createTextLabelMesh('VIP', '#7c2d12', 'rgba(0, 0, 0, 0)', 130, 0.88, 0.56)
      vip.rotation.x = -Math.PI / 2
      vip.rotation.z = tiltAngle
      vip.position.set(position.x, 0.17, position.z)
      group.add(vip)
    }

    if (slot.kind === 'regular' && !slot.unlocked) {
      const plus = createTextLabelMesh('+', '#4ade80', 'rgba(0, 0, 0, 0)', 260, 0.96, 0.96)
      plus.rotation.x = -Math.PI / 2
      plus.rotation.z = tiltAngle
      plus.position.set(position.x, 0.17, position.z)
      group.add(plus)
    }
  }

  return group
}

function parkingApronShape(width: number, depth: number): THREE.Shape {
  const w = width / 2
  const h = depth / 2
  const bottomRadius = Math.min(0.46, h * 0.35)
  const sideRadius = Math.min(0.74, h * 0.5)
  const notchHalfWidth = 0.46
  const notchDepth = 0.26
  const shape = new THREE.Shape()

  shape.moveTo(-w + bottomRadius, h)
  shape.lineTo(w - bottomRadius, h)
  shape.quadraticCurveTo(w, h, w, h - bottomRadius)
  shape.lineTo(w, -h + sideRadius)
  shape.bezierCurveTo(w, -h + 0.22, w - 0.42, -h + 0.03, w - 1.12, -h)
  shape.bezierCurveTo(w - 3.8, -h - 0.08, w * 0.32, -h + 0.08, notchHalfWidth, -h + 0.08)
  shape.bezierCurveTo(notchHalfWidth * 0.72, -h + 0.14, notchHalfWidth * 0.62, -h + notchDepth, 0, -h + notchDepth)
  shape.bezierCurveTo(-notchHalfWidth * 0.62, -h + notchDepth, -notchHalfWidth * 0.72, -h + 0.14, -notchHalfWidth, -h + 0.08)
  shape.bezierCurveTo(-w * 0.32, -h + 0.08, -w + 3.8, -h - 0.08, -w + 1.12, -h)
  shape.bezierCurveTo(-w + 0.42, -h + 0.03, -w, -h + 0.22, -w, -h + sideRadius)
  shape.lineTo(-w, h - bottomRadius)
  shape.quadraticCurveTo(-w, h, -w + bottomRadius, h)
  shape.closePath()

  return shape
}

function roundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const w = width / 2
  const h = height / 2
  const r = Math.min(radius, Math.min(w, h))
  const shape = new THREE.Shape()
  shape.moveTo(-w + r, -h)
  shape.lineTo(w - r, -h)
  shape.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false)
  shape.lineTo(w, h - r)
  shape.absarc(w - r, h - r, r, 0, Math.PI / 2, false)
  shape.lineTo(-w + r, h)
  shape.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false)
  shape.lineTo(-w, -h + r)
  shape.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false)

  return shape
}

function makeRoundedRectOutline(width: number, height: number, radius: number, thickness: number): THREE.BufferGeometry {
  const outer = roundedRectShape(width, height, radius)
  const inner = roundedRectPath(width - thickness * 2, height - thickness * 2, Math.max(0.02, radius - thickness))
  outer.holes.push(inner)

  return new THREE.ExtrudeGeometry(outer, { depth: 0.018, bevelEnabled: false })
}

function roundedRectPath(width: number, height: number, radius: number): THREE.Path {
  const w = width / 2
  const h = height / 2
  const r = Math.min(radius, Math.min(w, h))
  const path = new THREE.Path()
  path.moveTo(-w + r, -h)
  path.lineTo(w - r, -h)
  path.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false)
  path.lineTo(w, h - r)
  path.absarc(w - r, h - r, r, 0, Math.PI / 2, false)
  path.lineTo(-w + r, h)
  path.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false)
  path.lineTo(-w, -h + r)
  path.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false)

  return path
}

function makeLaneDivider(): THREE.Object3D {
  const group = new THREE.Group()
  const dashLength = 0.42
  const dashGap = 0.36
  const total = dashLength + dashGap
  const span = ASPHALT_WIDTH - 1.4
  const dashCount = Math.floor(span / total)
  const start = -((dashCount * total) - dashGap) / 2
  const material = new THREE.MeshBasicMaterial({ color: '#e2e8f0' })

  for (let i = 0; i < dashCount; i += 1) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(dashLength, 0.012, 0.085), material)
    dash.position.set(start + i * total + dashLength / 2, 0, 0)
    group.add(dash)
  }

  return group
}
