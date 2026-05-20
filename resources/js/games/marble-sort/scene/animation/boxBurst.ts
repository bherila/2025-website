import * as THREE from 'three'

import { MARBLE_COLORS, type MarbleColor } from '../../gameEngine'

const BURST_DURATION = 0.4

export interface BoxBurst {
  group: THREE.Group
  startedAt: number
  duration: number
  ring: THREE.Mesh
  shards: THREE.Mesh[]
}

export function createBoxBurst(position: THREE.Vector3, color: MarbleColor): BoxBurst {
  const group = new THREE.Group()
  group.position.copy(position)

  const hex = MARBLE_COLORS[color]?.hex ?? '#ffffff'
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.4, 32),
    new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.2
  group.add(ring)

  const shards: THREE.Mesh[] = []
  for (let i = 0; i < 6; i += 1) {
    const shard = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.06, 0.16),
      new THREE.MeshStandardMaterial({ color: hex, roughness: 0.4, transparent: true, opacity: 0.95 }),
    )
    const angle = (i / 6) * Math.PI * 2
    shard.userData.direction = new THREE.Vector3(Math.cos(angle), 1.4 + Math.random() * 0.5, Math.sin(angle))
    shard.userData.spin = (Math.random() - 0.5) * 5
    shard.position.y = 0.16
    group.add(shard)
    shards.push(shard)
  }

  return { group, startedAt: performance.now() / 1000, duration: BURST_DURATION, ring, shards }
}

export function updateBoxBurst(burst: BoxBurst, now: number): boolean {
  const progress = (now - burst.startedAt) / burst.duration
  if (progress >= 1) {
    return true
  }

  const scale = 1 + progress * 1.8
  burst.ring.scale.setScalar(scale)
  const ringMaterial = burst.ring.material as THREE.MeshBasicMaterial
  ringMaterial.opacity = Math.max(0, 0.85 - progress)

  const dt = 0.016
  for (const shard of burst.shards) {
    const direction = shard.userData.direction as THREE.Vector3
    shard.position.x += direction.x * dt * 1.6
    shard.position.y += direction.y * dt * (1 - progress * 0.4)
    shard.position.z += direction.z * dt * 1.6
    direction.y -= 4 * dt
    const spin = shard.userData.spin as number
    shard.rotation.x += spin * dt
    shard.rotation.z += spin * dt * 0.7
    const material = shard.material as THREE.MeshStandardMaterial
    material.opacity = Math.max(0, 1 - progress * 1.2)
  }

  return false
}

export function disposeBoxBurst(burst: BoxBurst): void {
  burst.ring.geometry.dispose()
  ;(burst.ring.material as THREE.Material).dispose()
  for (const shard of burst.shards) {
    shard.geometry.dispose()
    ;(shard.material as THREE.Material).dispose()
  }
}
