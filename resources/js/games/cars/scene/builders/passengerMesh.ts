import * as THREE from 'three'

import { CAR_PATTERN_VALUES, type CarPattern } from '../../gameTypes'
import type { PassengerInstanceHandle, PassengerInstancePools } from '../sceneTypes'
import { drawCarPatternCue } from './carMesh'

export interface PassengerVisualOptions {
  colorblindMode?: boolean
  pattern?: CarPattern
}

export function createPassengerMesh(color: string, options: PassengerVisualOptions = {}): THREE.Group {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.42 })
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), material)
  head.position.y = 0.45
  head.castShadow = true
  group.add(head)

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.24, 8, 16), material)
  body.position.y = 0.22
  body.castShadow = true
  group.add(body)

  if (options.colorblindMode === true && options.pattern) {
    group.add(createPassengerPatternBadge(options.pattern))
  }

  return group
}

export function createPassengerInstancePools(
  capacity: number,
  options: Pick<PassengerVisualOptions, 'colorblindMode'> = {},
): PassengerInstancePools {
  const instanceCapacity = Math.max(0, Math.floor(capacity))
  const headMesh = new THREE.InstancedMesh(
    withWhiteVertexColors(new THREE.SphereGeometry(0.14, 16, 16)),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.42, vertexColors: true }),
    instanceCapacity,
  )
  headMesh.castShadow = true
  headMesh.frustumCulled = false
  headMesh.count = 0

  const bodyMesh = new THREE.InstancedMesh(
    withWhiteVertexColors(new THREE.CapsuleGeometry(0.1, 0.24, 8, 16)),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.42, vertexColors: true }),
    instanceCapacity,
  )
  bodyMesh.castShadow = true
  bodyMesh.frustumCulled = false
  bodyMesh.count = 0

  const badgeMeshes: Partial<Record<CarPattern, THREE.InstancedMesh>> = {}
  if (options.colorblindMode === true) {
    for (const pattern of CAR_PATTERN_VALUES) {
      const badgeMesh = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(0.16, 0.16),
        new THREE.MeshBasicMaterial({
          map: createPassengerPatternTexture(pattern),
          transparent: true,
          depthWrite: false,
        }),
        instanceCapacity,
      )
      badgeMesh.frustumCulled = false
      badgeMesh.count = 0
      badgeMeshes[pattern] = badgeMesh
    }
  }

  return {
    badgeCounts: {},
    badgeMeshes,
    bodyMesh,
    capacity: instanceCapacity,
    headMesh,
    used: 0,
  }
}

export function resetPassengerInstancePools(pools: PassengerInstancePools): void {
  pools.used = 0
  pools.badgeCounts = {}
  pools.headMesh.count = 0
  pools.bodyMesh.count = 0
  for (const badgeMesh of Object.values(pools.badgeMeshes)) {
    if (badgeMesh) {
      badgeMesh.count = 0
    }
  }
}

export function passengerInstancePoolMeshes(pools: PassengerInstancePools): THREE.InstancedMesh[] {
  const badgeMeshes = CAR_PATTERN_VALUES
    .map((pattern) => pools.badgeMeshes[pattern])
    .filter((mesh): mesh is THREE.InstancedMesh => Boolean(mesh))

  return [pools.headMesh, pools.bodyMesh, ...badgeMeshes]
}

export function createPassengerInstanceHandle(
  pools: PassengerInstancePools,
  color: string,
  options: PassengerVisualOptions = {},
): PassengerInstanceHandle {
  if (pools.used >= pools.capacity) {
    throw new RangeError(`Passenger instance pool capacity ${pools.capacity} exceeded`)
  }

  const colorValue = new THREE.Color(color)
  const headIndex = pools.used
  const bodyIndex = pools.used
  pools.used += 1
  pools.headMesh.count = pools.used
  pools.bodyMesh.count = pools.used
  pools.headMesh.setColorAt(headIndex, colorValue)
  pools.bodyMesh.setColorAt(bodyIndex, colorValue)
  if (pools.headMesh.instanceColor) {
    pools.headMesh.instanceColor.needsUpdate = true
  }
  if (pools.bodyMesh.instanceColor) {
    pools.bodyMesh.instanceColor.needsUpdate = true
  }

  const badgePattern = options.colorblindMode === true ? options.pattern ?? null : null
  const badgeIndex = badgePattern ? nextBadgeIndex(pools, badgePattern) : null

  return {
    badgeIndex,
    badgePattern,
    bodyIndex,
    color: colorValue,
    headIndex,
    pool: pools,
  }
}

function nextBadgeIndex(pools: PassengerInstancePools, pattern: CarPattern): number | null {
  const badgeMesh = pools.badgeMeshes[pattern]
  if (!badgeMesh) {
    return null
  }

  const index = pools.badgeCounts[pattern] ?? 0
  if (index >= pools.capacity) {
    return null
  }

  pools.badgeCounts[pattern] = index + 1
  badgeMesh.count = index + 1

  return index
}

function withWhiteVertexColors<T extends THREE.BufferGeometry>(geometry: T): T {
  const position = geometry.getAttribute('position')
  const colors = new Float32Array(position.count * 3).fill(1)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  return geometry
}

function createPassengerPatternBadge(pattern: CarPattern): THREE.Mesh {
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.16),
    new THREE.MeshBasicMaterial({
      map: createPassengerPatternTexture(pattern),
      transparent: true,
      depthWrite: false,
    }),
  )
  badge.position.y = 0.61
  badge.rotation.x = -Math.PI / 2

  return badge
}

const passengerPatternCanvasCache = new Map<CarPattern, HTMLCanvasElement>()

function createPassengerPatternTexture(pattern: CarPattern): THREE.CanvasTexture {
  let canvas = passengerPatternCanvasCache.get(pattern)
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const context = canvas.getContext('2d')
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height)
      drawCarPatternCue(context, pattern, 8, 8, 112)
    }
    passengerPatternCanvasCache.set(pattern, canvas)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  return texture
}
