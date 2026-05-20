import * as THREE from 'three'

import { sortingStackBlockOffset } from '../sceneGeometry'

const RISE_DURATION = 0.32

export interface StackRiseTween {
  group: THREE.Group
  startedAt: number
  duration: number
}

export function createStackRiseTween(stackGroup: THREE.Group): StackRiseTween {
  for (const child of stackGroup.children) {
    const depth = typeof child.userData.depth === 'number' ? child.userData.depth : null
    if (depth === null) {
      continue
    }
    const target = sortingStackBlockOffset(depth)
    const start = sortingStackBlockOffset(depth + 1)
    child.position.copy(start)
    child.userData.riseFrom = start.clone()
    child.userData.riseTo = target.clone()
  }

  return {
    group: stackGroup,
    startedAt: performance.now() / 1000,
    duration: RISE_DURATION,
  }
}

export function updateStackRiseTween(tween: StackRiseTween, now: number): boolean {
  const t = (now - tween.startedAt) / tween.duration
  const eased = easeOutBack(Math.min(1, Math.max(0, t)))

  for (const child of tween.group.children) {
    const from = child.userData.riseFrom as THREE.Vector3 | undefined
    const to = child.userData.riseTo as THREE.Vector3 | undefined
    if (!from || !to) {
      continue
    }
    child.position.set(
      from.x + (to.x - from.x) * eased,
      from.y + (to.y - from.y) * eased,
      from.z + (to.z - from.z) * eased,
    )
  }

  if (t >= 1) {
    for (const child of tween.group.children) {
      delete child.userData.riseFrom
      delete child.userData.riseTo
    }
    return true
  }

  return false
}

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
