import * as THREE from 'three'

export interface SlotDropTween {
  marbleId: string
  mesh: THREE.Group
  from: THREE.Vector3
  target: THREE.Vector3
  startedAt: number
  duration: number
}

export function createSlotDropTween(
  marbleId: string,
  mesh: THREE.Group,
  target: THREE.Vector3,
  now: number,
  duration = 0.26,
): SlotDropTween {
  return {
    marbleId,
    mesh,
    from: mesh.position.clone(),
    target: target.clone(),
    startedAt: now,
    duration,
  }
}

export function updateSlotDropTween(tween: SlotDropTween, now: number): boolean {
  const t = Math.min(1, Math.max(0, (now - tween.startedAt) / tween.duration))
  const eased = easeInQuad(t)
  tween.mesh.position.set(
    tween.from.x + (tween.target.x - tween.from.x) * eased,
    tween.from.y + (tween.target.y - tween.from.y) * eased,
    tween.from.z + (tween.target.z - tween.from.z) * eased,
  )
  tween.mesh.rotation.x += 0.18

  return t >= 1
}

function easeInQuad(t: number): number {
  return t * t
}
