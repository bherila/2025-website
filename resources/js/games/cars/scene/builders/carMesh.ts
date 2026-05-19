import * as THREE from 'three'

import { type Car,CAR_COLORS } from '../../gameEngine'
import { CELL_SIZE, PARKED_ROTATION } from '../sceneConstants'
import { rotationForDirection } from '../sceneGeometry'
import { lighten, roundedRect } from '../threeUtils'

export function createCarMesh(car: Car, position: THREE.Vector3, parked: boolean): THREE.Group {
  const group = new THREE.Group()
  const color = CAR_COLORS[car.color].hex
  const carWidth = 0.54
  const carLength = parked ? 0.44 + car.length * 0.44 : car.length * CELL_SIZE - 0.12
  const body = new THREE.Mesh(
    roundedBoxGeometry(carWidth, 0.34, carLength, 0.085),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.42,
      metalness: 0.05,
    }),
  )
  body.castShadow = true
  body.receiveShadow = true
  body.position.y = 0.25
  group.add(body)

  const roof = new THREE.Mesh(
    roundedBoxGeometry(carWidth * 0.78, 0.24, Math.max(0.42, carLength * 0.45), 0.065),
    new THREE.MeshStandardMaterial({ color: lighten(color), roughness: 0.4, metalness: 0.04 }),
  )
  roof.position.y = 0.54
  roof.position.z = -carLength * 0.05
  roof.castShadow = true
  group.add(roof)

  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(carWidth * 0.68, 0.025, Math.max(0.12, carLength * 0.2)),
    new THREE.MeshStandardMaterial({ color: '#e0f2fe', roughness: 0.1, metalness: 0.1 }),
  )
  windshield.position.y = 0.68
  windshield.position.z = carLength * 0.18
  group.add(windshield)

  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.105, 0.105, 0.085, 16),
        new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.5 }),
      )
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(side * (carWidth / 2 + 0.04), 0.14, end * (carLength / 2 - 0.18))
      wheel.castShadow = true
      group.add(wheel)
    }
  }

  const decal = createCarDecal(car, carWidth, carLength)
  group.add(decal)

  group.position.copy(position)
  group.rotation.y = parked ? PARKED_ROTATION : rotationForDirection(car.direction)
  group.userData = { carId: car.id }
  group.traverse((child) => {
    child.userData = { carId: car.id }
  })

  return group
}

export function createCarDecal(car: Car, carWidth: number, carLength: number): THREE.Mesh {
  const texture = createCarDecalTexture(car)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  })
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(carWidth * 0.86, Math.min(carLength * 0.74, 1.25)),
    material,
  )
  decal.rotation.x = -Math.PI / 2
  decal.rotation.z = Math.PI
  decal.position.set(0, 0.705, -carLength * 0.02)

  return decal
}

const decalCanvasCache = new Map<number, HTMLCanvasElement>()

export function createCarDecalTexture(car: Car): THREE.CanvasTexture {
  const remaining = Math.max(0, car.capacity - car.boarded)
  let canvas = decalCanvasCache.get(remaining)
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const context = canvas.getContext('2d')
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = 'rgba(15, 23, 42, 0.66)'
      roundedRect(context, 18, 18, 220, 220, 30)
      context.fill()

      context.fillStyle = '#ffffff'
      context.strokeStyle = 'rgba(15, 23, 42, 0.5)'
      context.lineWidth = 12
      context.lineJoin = 'round'
      context.beginPath()
      context.moveTo(128, 30)
      context.lineTo(190, 92)
      context.lineTo(154, 92)
      context.lineTo(154, 132)
      context.lineTo(102, 132)
      context.lineTo(102, 92)
      context.lineTo(66, 92)
      context.closePath()
      context.stroke()
      context.fill()

      context.font = '900 102px Atkinson Hyperlegible Next, Arial, sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.lineWidth = 14
      context.strokeText(String(remaining), 128, 188)
      context.fillText(String(remaining), 128, 188)
    }
    decalCanvasCache.set(remaining, canvas)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  return texture
}

const roundedBoxCache = new Map<string, THREE.BufferGeometry>()

function roundedBoxGeometry(width: number, height: number, depth: number, radius: number): THREE.BufferGeometry {
  const key = `${width.toFixed(3)}|${height.toFixed(3)}|${depth.toFixed(3)}|${radius.toFixed(3)}`
  const cached = roundedBoxCache.get(key)
  if (cached) {
    return cached
  }

  const r = Math.min(radius, Math.min(width, depth) / 2)
  const innerWidth = width - 2 * r
  const innerDepth = depth - 2 * r
  const shape = new THREE.Shape()
  shape.moveTo(-innerWidth / 2, -depth / 2)
  shape.lineTo(innerWidth / 2, -depth / 2)
  shape.absarc(innerWidth / 2, -innerDepth / 2, r, -Math.PI / 2, 0, false)
  shape.lineTo(width / 2, innerDepth / 2)
  shape.absarc(innerWidth / 2, innerDepth / 2, r, 0, Math.PI / 2, false)
  shape.lineTo(-innerWidth / 2, depth / 2)
  shape.absarc(-innerWidth / 2, innerDepth / 2, r, Math.PI / 2, Math.PI, false)
  shape.lineTo(-width / 2, -innerDepth / 2)
  shape.absarc(-innerWidth / 2, -innerDepth / 2, r, Math.PI, Math.PI * 1.5, false)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: r * 0.5,
    bevelSize: r * 0.5,
    bevelSegments: 3,
    curveSegments: 8,
  })
  geometry.translate(0, 0, -height / 2)
  geometry.rotateX(-Math.PI / 2)
  roundedBoxCache.set(key, geometry)

  return geometry
}
