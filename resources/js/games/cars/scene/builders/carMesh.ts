import * as THREE from 'three'

import { type Car, CAR_COLORS, CAR_PATTERNS, type CarPattern } from '../../gameTypes'
import { CELL_SIZE, PARKED_ROTATION, PARKING_SLOT_TILT } from '../sceneConstants'
import { rotationForDirection } from '../sceneGeometry'
import { lighten, roundedRect } from '../threeUtils'

export interface CarVisualOptions {
  colorblindMode?: boolean
  hideColor?: boolean
}

export interface CarVisualMetrics {
  bodyHeight: number
  carLength: number
  carWidth: number
  counterSize: number
  counterZ: number
  decalSize: number
  decalZ: number
  roofLength: number
  roofWidth: number
}

const FIELD_CAR_WIDTH = CELL_SIZE * 0.56
const FIELD_CAR_END_PADDING = CELL_SIZE * 0.22
const PARKED_CAR_WIDTH = CELL_SIZE * 0.58
const PARKED_CAR_END_PADDING = CELL_SIZE * 0.28
const COUNTER_SIZE = 0.3

export function carVisualMetrics(car: Pick<Car, 'length'>, parked: boolean): CarVisualMetrics {
  const carWidth = parked ? PARKED_CAR_WIDTH : FIELD_CAR_WIDTH
  const carLength = parked
    ? Math.max(CELL_SIZE, car.length * CELL_SIZE - PARKED_CAR_END_PADDING)
    : Math.max(CELL_SIZE, car.length * CELL_SIZE - FIELD_CAR_END_PADDING)
  const counterZ = carLength * 0.14

  return {
    bodyHeight: 0.34,
    carLength,
    carWidth,
    counterSize: COUNTER_SIZE,
    counterZ,
    decalSize: Math.min(carWidth * 0.72, 0.3),
    decalZ: Math.min(carLength * 0.39, counterZ + COUNTER_SIZE * 0.94),
    roofLength: Math.max(0.34, carLength * 0.5),
    roofWidth: carWidth * 0.78,
  }
}

export function createCarMesh(
  car: Car,
  position: THREE.Vector3,
  parked: boolean,
  options: CarVisualOptions = {},
): THREE.Group {
  const group = new THREE.Group()
  const hideColor = options.hideColor === true || (car.colorHidden && !parked)
  const color = hideColor ? '#1f2937' : CAR_COLORS[car.color].hex
  const metrics = carVisualMetrics(car, parked)
  const body = new THREE.Mesh(
    roundedBoxGeometry(metrics.carWidth, metrics.bodyHeight, metrics.carLength, 0.085),
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
    roundedBoxGeometry(metrics.roofWidth, 0.24, metrics.roofLength, 0.065),
    new THREE.MeshStandardMaterial({ color: hideColor ? '#374151' : lighten(color), roughness: 0.4, metalness: 0.04 }),
  )
  roof.position.y = 0.54
  roof.position.z = -metrics.carLength * 0.05
  roof.castShadow = true
  group.add(roof)

  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.105, 0.105, 0.085, 16),
        new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.5 }),
      )
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(side * (metrics.carWidth / 2 + 0.04), 0.14, end * (metrics.carLength / 2 - 0.18))
      wheel.castShadow = true
      group.add(wheel)
    }
  }

  const decal = createCarDecal(car, metrics, options)
  group.add(decal)

  const hideCount = options.hideColor === true || car.colorHidden
  if (!hideCount) {
    const counter = createCarCounterSprite(car, metrics)
    group.add(counter)
  }

  group.position.copy(position)
  group.rotation.y = parked ? PARKED_ROTATION + PARKING_SLOT_TILT : rotationForDirection(car.direction)
  group.userData = { carId: car.id }
  group.traverse((child) => {
    child.userData = { carId: car.id }
  })

  return group
}

export function createCarDecal(
  car: Car,
  metrics: CarVisualMetrics,
  options: CarVisualOptions = {},
): THREE.Mesh {
  const texture = createCarDecalTexture(car, options)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  })
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(metrics.decalSize, metrics.decalSize), material)
  decal.rotation.x = -Math.PI / 2
  decal.rotation.z = Math.PI
  decal.position.set(0, 0.705, metrics.decalZ)

  return decal
}

const decalCanvasCache = new Map<string, HTMLCanvasElement>()

export function createCarDecalTexture(car: Car, options: CarVisualOptions = {}): THREE.CanvasTexture {
  const colorblindMode = options.colorblindMode === true
  const hideColor = options.hideColor === true || car.colorHidden
  const pattern = colorblindMode && !hideColor ? CAR_PATTERNS[car.color] : null
  const cacheKey = `${hideColor ? 'hidden' : 'visible'}|${colorblindMode ? car.color : 'off'}`
  let canvas = decalCanvasCache.get(cacheKey)
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const context = canvas.getContext('2d')
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height)

      if (hideColor) {
        context.fillStyle = '#ffffff'
        context.strokeStyle = 'rgba(15, 23, 42, 0.82)'
        context.lineWidth = 22
        context.lineJoin = 'round'
        context.font = '900 210px Atkinson Hyperlegible Next, Arial, sans-serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.strokeText('?', 128, 138)
        context.fillText('?', 128, 138)
      } else {
        context.fillStyle = '#ffffff'
        context.strokeStyle = 'rgba(15, 23, 42, 0.82)'
        context.lineWidth = 26
        context.lineJoin = 'round'
        context.lineCap = 'round'
        context.beginPath()
        context.moveTo(128, 20)
        context.lineTo(224, 120)
        context.lineTo(172, 120)
        context.lineTo(172, 190)
        context.lineTo(84, 190)
        context.lineTo(84, 120)
        context.lineTo(32, 120)
        context.closePath()
        context.stroke()
        context.fill()
      }

      if (pattern) {
        drawCarPatternCue(context, pattern, 20, 200, 48)
      }
    }
    decalCanvasCache.set(cacheKey, canvas)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  return texture
}

export function drawCarPatternCue(
  context: CanvasRenderingContext2D,
  pattern: CarPattern,
  x: number,
  y: number,
  size: number,
): void {
  const stroke = 'rgba(15, 23, 42, 0.86)'
  const fill = '#ffffff'
  const accent = 'rgba(15, 23, 42, 0.2)'
  const centerX = x + size / 2
  const centerY = y + size / 2
  const unit = size / 8

  context.save()
  context.fillStyle = 'rgba(255, 255, 255, 0.96)'
  roundedRect(context, x, y, size, size, size * 0.22)
  context.fill()
  context.strokeStyle = stroke
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = Math.max(3, size * 0.075)

  switch (pattern) {
    case 'dot':
      context.fillStyle = stroke
      for (const offsetX of [-1, 1]) {
        for (const offsetY of [-1, 1]) {
          context.beginPath()
          context.arc(centerX + offsetX * unit * 1.35, centerY + offsetY * unit * 1.35, unit * 0.85, 0, Math.PI * 2)
          context.fill()
        }
      }
      break
    case 'stripe':
      for (let index = -2; index <= 2; index += 1) {
        context.beginPath()
        context.moveTo(x + unit * 1.1, centerY + index * unit * 1.15)
        context.lineTo(x + size - unit * 1.1, centerY + index * unit * 1.15)
        context.stroke()
      }
      break
    case 'triangle':
      context.fillStyle = accent
      context.beginPath()
      context.moveTo(centerX, y + unit * 1.15)
      context.lineTo(x + size - unit * 1.25, y + size - unit * 1.2)
      context.lineTo(x + unit * 1.25, y + size - unit * 1.2)
      context.closePath()
      context.fill()
      context.stroke()
      break
    case 'star':
      drawStar(context, centerX, centerY, unit * 3.05, unit * 1.35)
      context.fillStyle = accent
      context.fill()
      context.stroke()
      break
    case 'diamond':
      context.fillStyle = accent
      context.beginPath()
      context.moveTo(centerX, y + unit)
      context.lineTo(x + size - unit, centerY)
      context.lineTo(centerX, y + size - unit)
      context.lineTo(x + unit, centerY)
      context.closePath()
      context.fill()
      context.stroke()
      break
    case 'chevron':
      for (const inset of [unit * 1.55, unit * 3]) {
        context.beginPath()
        context.moveTo(x + unit * 1.3, y + inset)
        context.lineTo(centerX, y + inset + unit * 1.45)
        context.lineTo(x + size - unit * 1.3, y + inset)
        context.stroke()
      }
      break
    case 'ring':
      context.beginPath()
      context.arc(centerX, centerY, unit * 2.45, 0, Math.PI * 2)
      context.stroke()
      context.beginPath()
      context.arc(centerX, centerY, unit * 0.85, 0, Math.PI * 2)
      context.stroke()
      break
    case 'crosshatch':
      for (let index = -1; index <= 1; index += 1) {
        context.beginPath()
        context.moveTo(x + unit * (1.1 + index * 1.6), y + unit * 1.1)
        context.lineTo(x + unit * (4.9 + index * 1.6), y + size - unit * 1.1)
        context.stroke()
        context.beginPath()
        context.moveTo(x + size - unit * (1.1 + index * 1.6), y + unit * 1.1)
        context.lineTo(x + size - unit * (4.9 + index * 1.6), y + size - unit * 1.1)
        context.stroke()
      }
      break
  }

  context.restore()
}

function drawStar(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
): void {
  context.beginPath()
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? outerRadius : innerRadius
    const angle = -Math.PI / 2 + (point * Math.PI) / 5
    const x = centerX + Math.cos(angle) * radius
    const y = centerY + Math.sin(angle) * radius
    if (point === 0) {
      context.moveTo(x, y)
    } else {
      context.lineTo(x, y)
    }
  }
  context.closePath()
}

const counterCanvasCache = new Map<number, HTMLCanvasElement>()

export function createCarCounterSprite(car: Car, metrics: CarVisualMetrics): THREE.Sprite {
  const remaining = Math.max(0, car.capacity - car.boarded)
  let canvas = counterCanvasCache.get(remaining)
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = 192
    canvas.height = 192
    const context = canvas.getContext('2d')
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#ffffff'
      context.strokeStyle = 'rgba(15, 23, 42, 0.82)'
      context.lineWidth = 12
      context.beginPath()
      context.arc(96, 96, 80, 0, Math.PI * 2)
      context.fill()
      context.stroke()
      context.fillStyle = '#0f172a'
      const text = String(remaining)
      const fontSize = text.length >= 2 ? 110 : 134
      context.font = `900 ${fontSize}px Atkinson Hyperlegible Next, Arial, sans-serif`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(text, 96, 102)
    }
    counterCanvasCache.set(remaining, canvas)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }))
  sprite.scale.set(metrics.counterSize, metrics.counterSize, 1)
  sprite.position.set(0, 0.78, metrics.counterZ)
  sprite.renderOrder = 2

  return sprite
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
