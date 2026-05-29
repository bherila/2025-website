import * as THREE from 'three'

import { type GameState, loopPassengerCapacity } from '../../gameEngine'
import { QUEUE_Z } from '../sceneConstants'
import { feederCurve, feederFillDistance, feederTrackCurve, queueLayoutForState } from '../sceneGeometry'
import { createTextSprite } from '../threeUtils'

const FEEDER_TRACK_MAX_EXTENSION = 16

const TRACK_OUTER_PAD = 0.42
const TRACK_INNER_PAD = 0.28

export function createQueueTrack(state: GameState): THREE.Object3D {
  const group = new THREE.Group()
  const layout = queueLayoutForState(state)
  const { straightLength, capRadius } = layout

  const trackOuter = makeStadiumShape(straightLength, capRadius + TRACK_OUTER_PAD)
  const trackHole = makeStadiumPath(straightLength, Math.max(0.15, capRadius - TRACK_INNER_PAD))
  trackOuter.holes.push(trackHole)
  const track = new THREE.Mesh(
    new THREE.ExtrudeGeometry(trackOuter, { depth: 0.12, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: '#6f7c93', roughness: 0.66 }),
  )
  track.rotation.x = -Math.PI / 2
  track.position.set(0, 0.14, QUEUE_Z)
  track.receiveShadow = true
  group.add(track)

  const ringOuter = makeStadiumShape(straightLength, capRadius + TRACK_OUTER_PAD + 0.06)
  const ringInner = makeStadiumPath(straightLength, capRadius + TRACK_OUTER_PAD - 0.02)
  ringOuter.holes.push(ringInner)
  const rim = new THREE.Mesh(
    new THREE.ExtrudeGeometry(ringOuter, { depth: 0.04, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: '#f7fbff', roughness: 0.56 }),
  )
  rim.rotation.x = -Math.PI / 2
  rim.position.set(0, 0.18, QUEUE_Z)
  group.add(rim)

  const innerShape = makeStadiumShape(straightLength, Math.max(0.15, capRadius - TRACK_INNER_PAD - 0.02))
  const infield = new THREE.Mesh(
    new THREE.ExtrudeGeometry(innerShape, { depth: 0.04, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: '#85cf70', roughness: 0.84 }),
  )
  infield.rotation.x = -Math.PI / 2
  infield.position.set(0, 0.16, QUEUE_Z)
  infield.receiveShadow = true
  group.add(infield)

  const label = createTextSprite(`Level ${state.level}`, '#ffffff', 'rgba(15, 23, 42, 0.62)', 46)
  label.position.set(0, 0.92, QUEUE_Z - capRadius - TRACK_OUTER_PAD - 0.46)
  label.scale.set(1.7, 0.52, 1)
  group.add(label)

  const gate = new THREE.Mesh(
    new THREE.BoxGeometry(1.24, 0.08, 0.18),
    new THREE.MeshStandardMaterial({ color: '#f8fafc', emissive: '#dbeafe', emissiveIntensity: 0.25 }),
  )
  gate.position.set(0, 0.22, QUEUE_Z + capRadius + TRACK_OUTER_PAD + 0.12)
  group.add(gate)

  const walkway = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.055, 1.3),
    new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.55 }),
  )
  walkway.position.set(0, 0.13, QUEUE_Z + capRadius + TRACK_OUTER_PAD + 0.78)
  group.add(walkway)

  const extraDistance = feederTrackExtension(state, layout)
  for (const side of [-1, 1] as const) {
    const curve = feederTrackCurve(side, layout, extraDistance)
    const samples = Math.max(48, Math.ceil(curve.getLength() / 0.18))
    const trim = flatRibbonAlongCurve(curve, 0.72, 0.05, '#dbe6ef', '#9fb0c4', 0.08, samples)
    trim.position.y = 0.05
    group.add(trim)

    const feeder = flatRibbonAlongCurve(curve, 0.62, 0.08, '#6f7c93', undefined, undefined, samples)
    feeder.position.y = 0.06
    feeder.receiveShadow = true
    group.add(feeder)
  }

  return group
}

function feederTrackExtension(state: GameState, layout: ReturnType<typeof queueLayoutForState>): number {
  const feederCount = Math.max(0, state.passengerQueue.length - loopPassengerCapacity(state))
  const perSideMax = Math.ceil(feederCount / 2)
  const curveLength = feederCurve(1, layout).getLength()
  // Extend a little past the last passenger so the walkway never ends under a feet.
  const needed = feederFillDistance(perSideMax) + 0.4 - curveLength

  return Math.max(0, Math.min(FEEDER_TRACK_MAX_EXTENSION, needed))
}

function flatRibbonAlongCurve(
  curve: THREE.Curve<THREE.Vector3>,
  halfWidth: number,
  thickness: number,
  color: string,
  emissive?: string,
  emissiveIntensity?: number,
  samples = 48,
): THREE.Mesh {
  const lefts: Array<{ x: number, z: number }> = []
  const rights: Array<{ x: number, z: number }> = []
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples
    const point = curve.getPointAt(t)
    const tangent = curve.getTangentAt(t)
    const nx = -tangent.z
    const nz = tangent.x
    const norm = Math.hypot(nx, nz) || 1
    const ux = (nx / norm) * halfWidth
    const uz = (nz / norm) * halfWidth
    lefts.push({ x: point.x + ux, z: point.z + uz })
    rights.push({ x: point.x - ux, z: point.z - uz })
  }

  const shape = new THREE.Shape()
  const first = lefts[0]
  if (!first) {
    return new THREE.Mesh()
  }
  shape.moveTo(first.x, -first.z)
  for (let i = 1; i < lefts.length; i += 1) {
    const point = lefts[i]
    if (point) {
      shape.lineTo(point.x, -point.z)
    }
  }
  for (let i = rights.length - 1; i >= 0; i -= 1) {
    const point = rights[i]
    if (point) {
      shape.lineTo(point.x, -point.z)
    }
  }
  shape.closePath()

  const material = emissive
    ? new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissiveIntensity ?? 0, roughness: 0.62 })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.62 })
  const mesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }),
    material,
  )
  mesh.rotation.x = -Math.PI / 2

  return mesh
}

function makeStadiumShape(straightLength: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape()
  appendStadiumPath(shape, straightLength, radius)

  return shape
}

function makeStadiumPath(straightLength: number, radius: number): THREE.Path {
  const path = new THREE.Path()
  appendStadiumPath(path, straightLength, radius)

  return path
}

function appendStadiumPath(path: THREE.Path | THREE.Shape, straightLength: number, radius: number): void {
  const halfStraight = straightLength / 2
  path.moveTo(-halfStraight, -radius)
  path.lineTo(halfStraight, -radius)
  path.absarc(halfStraight, 0, radius, -Math.PI / 2, Math.PI / 2, false)
  path.lineTo(-halfStraight, radius)
  path.absarc(-halfStraight, 0, radius, Math.PI / 2, Math.PI * 1.5, false)
}
