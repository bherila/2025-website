import { AUDIO_ASSET_NAMES, AUDIO_ASSET_PATHS, type AudioAssetName } from './audioAssets'

type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

let audioContext: AudioContext | null = null
let masterGain: GainNode | null = null
let muted = false

const decodedBuffers = new Map<AudioAssetName, AudioBuffer>()
const pendingBuffers = new Map<AudioAssetName, Promise<AudioBuffer | null>>()

export function setMuted(nextMuted: boolean): void {
  muted = nextMuted
  if (masterGain) {
    masterGain.gain.value = muted ? 0 : 1
  }
}

export function playSfx(name: AudioAssetName): void {
  void playSfxAsync(name)
}

export async function preloadSfx(): Promise<void> {
  const context = getAudioContext()
  if (!context) {
    return
  }

  await Promise.all(AUDIO_ASSET_NAMES.map((name) => loadAudioBuffer(context, name)))
}

async function playSfxAsync(name: AudioAssetName): Promise<void> {
  const context = getAudioContext()
  if (!context) {
    return
  }

  await resumeContext(context)

  const buffer = await loadAudioBuffer(context, name)
  if (!buffer) {
    return
  }

  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(getMasterGain(context))
  source.start()
}

function getAudioContext(): AudioContext | null {
  if (audioContext) {
    return audioContext
  }

  if (typeof window === 'undefined') {
    return null
  }

  const AudioContextConstructor = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext
  if (!AudioContextConstructor) {
    return null
  }

  audioContext = new AudioContextConstructor()

  return audioContext
}

function getMasterGain(context: AudioContext): GainNode {
  if (masterGain) {
    return masterGain
  }

  masterGain = context.createGain()
  masterGain.gain.value = muted ? 0 : 1
  masterGain.connect(context.destination)

  return masterGain
}

async function resumeContext(context: AudioContext): Promise<void> {
  if (context.state !== 'suspended') {
    return
  }

  try {
    await context.resume()
  } catch {
    // Some browsers reject resume outside a trusted user gesture.
  }
}

async function loadAudioBuffer(context: AudioContext, name: AudioAssetName): Promise<AudioBuffer | null> {
  const decoded = decodedBuffers.get(name)
  if (decoded) {
    return decoded
  }

  const pending = pendingBuffers.get(name)
  if (pending) {
    return pending
  }

  const promise = fetch(AUDIO_ASSET_PATHS[name])
    .then(async (response) => {
      if (!response.ok) {
        return null
      }

      const bytes = await response.arrayBuffer()
      const buffer = await context.decodeAudioData(bytes)
      decodedBuffers.set(name, buffer)

      return buffer
    })
    .catch(() => null)
    .finally(() => {
      pendingBuffers.delete(name)
    })

  pendingBuffers.set(name, promise)

  return promise
}
