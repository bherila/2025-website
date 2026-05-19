import * as THREE from 'three'

import type { GameState } from '../../gameEngine'
import { INCOMING_LANE_Z, OUTGOING_LANE_Z, PARKING_Z } from '../sceneConstants'
import { parkingSlotPosition } from '../sceneGeometry'
import { createTextSprite } from '../threeUtils'

const ASPHALT_WIDTH = 24.0
const ASPHALT_DEPTH = 4.4
const ASPHALT_CENTER_Z = PARKING_Z + 0.40

export function createParkingRow(state: GameState): THREE.Object3D {
  const group = new THREE.Group()

  const asphaltShape = roundedRectShape(ASPHALT_WIDTH, ASPHALT_DEPTH, 0.42)
  const asphalt = new THREE.Mesh(
    new THREE.ExtrudeGeometry(asphaltShape, { depth: 0.06, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: '#667386', roughness: 0.8 }),
  )
  asphalt.rotation.x = -Math.PI / 2
  asphalt.position.set(0, 0.05, ASPHALT_CENTER_Z)
  asphalt.receiveShadow = true
  group.add(asphalt)

  const laneDivider = makeLaneDivider()
  laneDivider.position.set(0, 0.12, (INCOMING_LANE_Z + OUTGOING_LANE_Z) / 2)
  group.add(laneDivider)

  for (const slot of state.parkingSlots) {
    const position = parkingSlotPosition(slot.index, slot.kind)
    const slotWidth = slot.kind === 'vip' ? 1.05 : 1.22
    const slotDepth = 1.86

    const slotShape = roundedRectShape(slotWidth, slotDepth, 0.18)
    const fillColor = slot.kind === 'vip'
      ? '#facc15'
      : slot.unlocked
        ? '#778296'
        : '#596474'
    const slotBase = new THREE.Mesh(
      new THREE.ExtrudeGeometry(slotShape, { depth: 0.025, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: fillColor, roughness: 0.7 }),
    )
    slotBase.rotation.x = -Math.PI / 2
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
    outlineMesh.position.set(position.x, 0.145, position.z)
    group.add(outlineMesh)

    if (slot.kind === 'vip') {
      const vip = createTextSprite('VIP', '#7c2d12', 'rgba(0, 0, 0, 0)', 64)
      vip.position.set(position.x, 0.4, position.z)
      vip.scale.set(0.86, 0.5, 1)
      group.add(vip)
    }

    if (slot.kind === 'regular' && !slot.unlocked) {
      const plus = createTextSprite('+', '#86efac', 'rgba(0, 0, 0, 0)', 96)
      plus.position.set(position.x, 0.36, position.z)
      plus.scale.set(0.66, 0.66, 1)
      group.add(plus)
    }
  }

  return group
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
