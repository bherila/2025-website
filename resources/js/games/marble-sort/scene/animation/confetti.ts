import * as THREE from 'three'

import { MARBLE_COLORS, type MarbleColor } from '../../gameEngine'

const CONFETTI_PALETTE = ['#ffe14a', '#ff7be0', '#71f0d3', '#ff9b3f', '#9b7bff', '#ffffff']
const CONFETTI_DURATION = 1.05

export interface ConfettiBurst {
  group: THREE.Group
  particles: ConfettiParticle[]
  startedAt: number
  duration: number
}

interface ConfettiParticle {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  angularVelocity: number
  baseScale: number
}

export function createConfettiBurst(position: THREE.Vector3, color: MarbleColor): ConfettiBurst {
  const group = new THREE.Group()
  group.position.copy(position)

  const particles: ConfettiParticle[] = []
  const count = 16
  const accent = MARBLE_COLORS[color]?.hex ?? '#ffffff'
  const palette = [accent, ...CONFETTI_PALETTE]

  for (let i = 0; i < count; i += 1) {
    const hex = palette[i % palette.length] ?? '#ffffff'
    const geometry = i % 2 === 0
      ? new THREE.PlaneGeometry(0.12, 0.06)
      : new THREE.PlaneGeometry(0.09, 0.09)
    const material = new THREE.MeshBasicMaterial({
      color: hex,
      side: THREE.DoubleSide,
      transparent: true,
    })
    const mesh = new THREE.Mesh(geometry, material)
    const angle = (i / count) * Math.PI * 2
    const speed = 1.2 + Math.random() * 1.1
    const velocity = new THREE.Vector3(
      Math.cos(angle) * speed * 0.85,
      1.6 + Math.random() * 0.7,
      Math.sin(angle) * speed * 0.65,
    )
    mesh.rotation.z = Math.random() * Math.PI
    mesh.position.set(0, 0.2, 0)
    group.add(mesh)
    particles.push({
      mesh,
      velocity,
      angularVelocity: (Math.random() - 0.5) * 6,
      baseScale: 0.9 + Math.random() * 0.4,
    })
  }

  return { group, particles, startedAt: performance.now() / 1000, duration: CONFETTI_DURATION }
}

export function updateConfettiBurst(burst: ConfettiBurst, now: number): boolean {
  const progress = (now - burst.startedAt) / burst.duration
  if (progress >= 1) {
    return true
  }

  const dt = 0.016
  for (const particle of burst.particles) {
    particle.velocity.y -= 5.5 * dt
    particle.mesh.position.x += particle.velocity.x * dt
    particle.mesh.position.y += particle.velocity.y * dt
    particle.mesh.position.z += particle.velocity.z * dt
    particle.mesh.rotation.z += particle.angularVelocity * dt
    particle.mesh.rotation.x += particle.angularVelocity * dt * 0.6
    const fade = Math.max(0, 1 - progress)
    const material = particle.mesh.material as THREE.MeshBasicMaterial
    material.opacity = fade
    const scale = particle.baseScale * (1 + progress * 0.5)
    particle.mesh.scale.setScalar(scale)
  }

  return false
}

export function disposeConfettiBurst(burst: ConfettiBurst): void {
  for (const particle of burst.particles) {
    particle.mesh.geometry.dispose()
    const material = particle.mesh.material
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose())
    } else {
      material.dispose()
    }
  }
}
