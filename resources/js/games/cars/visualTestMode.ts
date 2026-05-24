declare global {
  interface Window {
    __PARKING_PICKUP_VISUAL_READY__?: boolean
    __PARKING_PICKUP_VISUAL_STATE__?: ParkingPickupVisualState
  }
}

export interface ParkingPickupVisualState {
  frameCount: number
  level: number
  renderedAt: number
  seed: string | null
}

export interface ParkingPickupVisualTestOptions {
  colorblind: boolean | null
  enabled: boolean
  hud: 'compact' | 'normal'
  level: number | null
  reducedMotion: boolean
  seed: string | null
}

export function readParkingPickupVisualTestOptions(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
): ParkingPickupVisualTestOptions {
  const params = new URLSearchParams(search)
  const enabled = params.get('visualTest') === '1'

  const levelParam = params.get('level')
  const parsedLevel = levelParam === null ? Number.NaN : Number(levelParam)
  const level = Number.isFinite(parsedLevel) && parsedLevel >= 1 ? Math.floor(parsedLevel) : null

  return {
    colorblind: params.has('colorblind') ? params.get('colorblind') === '1' : null,
    enabled,
    hud: params.get('hud') === 'normal' ? 'normal' : 'compact',
    level,
    reducedMotion: params.get('reducedMotion') === '1',
    seed: params.get('seed'),
  }
}

export function resetParkingPickupVisualReadiness(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.__PARKING_PICKUP_VISUAL_READY__ = false
  delete window.__PARKING_PICKUP_VISUAL_STATE__
}

export function markParkingPickupVisualReady(state: ParkingPickupVisualState): void {
  if (typeof window === 'undefined') {
    return
  }

  window.__PARKING_PICKUP_VISUAL_STATE__ = state
  window.__PARKING_PICKUP_VISUAL_READY__ = true
}
