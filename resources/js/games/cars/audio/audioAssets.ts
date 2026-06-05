export const AUDIO_ASSET_PATHS = {
  'car-blocked': '/audio/games/cars/car-blocked.wav',
  'car-park-success': '/audio/games/cars/car-park-success.wav',
  'level-complete': '/audio/games/cars/level-complete.wav',
  'passenger-board': '/audio/games/cars/passenger-board.wav',
} as const

export type AudioAssetName = keyof typeof AUDIO_ASSET_PATHS

export const AUDIO_ASSET_NAMES = Object.keys(AUDIO_ASSET_PATHS) as AudioAssetName[]
