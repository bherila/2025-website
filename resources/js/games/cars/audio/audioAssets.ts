export const AUDIO_ASSET_PATHS = {
  'car-blocked': '/audio/games/cars/car-blocked.mp3',
  'car-park-success': '/audio/games/cars/car-park-success.mp3',
  'level-complete': '/audio/games/cars/level-complete.mp3',
  'passenger-board': '/audio/games/cars/passenger-board.mp3',
} as const

export type AudioAssetName = keyof typeof AUDIO_ASSET_PATHS

export const AUDIO_ASSET_NAMES = Object.keys(AUDIO_ASSET_PATHS) as AudioAssetName[]
