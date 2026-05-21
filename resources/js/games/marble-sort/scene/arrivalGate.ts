import { BASIN_HOLD_CORRIDOR_HALF_WIDTH, BASIN_SOUTH_Z, MARBLE_DIAMETER } from './sceneConstants'

export const ARRIVAL_Z_TOLERANCE = 0.05
export const ARRIVAL_CAPTURE_HALF_WIDTH = BASIN_HOLD_CORRIDOR_HALF_WIDTH + MARBLE_DIAMETER
export const ARRIVAL_RETRY_COOLDOWN = 0.15

interface ArrivalBodyPosition {
  position: { x: number, z: number }
}

export function shouldReportArrival(
  marbleId: string,
  body: ArrivalBodyPosition,
  fallingIds: ReadonlySet<string>,
  attempts: ReadonlyMap<string, number>,
  now: number,
  cooldown: number = ARRIVAL_RETRY_COOLDOWN,
): boolean {
  if (!fallingIds.has(marbleId)) {
    return false
  }
  if (body.position.z < BASIN_SOUTH_Z - ARRIVAL_Z_TOLERANCE) {
    return false
  }
  if (Math.abs(body.position.x) > ARRIVAL_CAPTURE_HALF_WIDTH) {
    return false
  }
  const last = attempts.get(marbleId) ?? Number.NEGATIVE_INFINITY
  return now - last >= cooldown
}
