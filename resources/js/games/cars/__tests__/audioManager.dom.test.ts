import { AUDIO_ASSET_NAMES } from '../audio/audioAssets'

interface FakeSource {
  buffer: AudioBuffer | null
  connect: jest.Mock
  start: jest.Mock
}

class FakeAudioContext {
  state: AudioContextState = 'suspended'
  destination = { name: 'destination' }
  gainNode = {
    connect: jest.fn(),
    gain: { value: 1 },
  }
  sources: FakeSource[] = []
  createGain = jest.fn(() => this.gainNode as unknown as GainNode)
  createBufferSource = jest.fn(() => {
    const source: FakeSource = {
      buffer: null,
      connect: jest.fn(),
      start: jest.fn(),
    }
    this.sources.push(source)

    return source as unknown as AudioBufferSourceNode
  })
  decodeAudioData = jest.fn(async () => fakeAudioBuffer)
  resume = jest.fn(async () => {
    this.state = 'running'
  })

  constructor() {
    createdContexts.push(this)
  }
}

const originalAudioContext = window.AudioContext
const fakeAudioBuffer = { duration: 0.2 } as AudioBuffer
const createdContexts: FakeAudioContext[] = []

describe('cars audio manager', () => {
  beforeEach(() => {
    jest.resetModules()
    createdContexts.length = 0
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: FakeAudioContext as unknown as typeof AudioContext,
      writable: true,
    })
    ;(globalThis.fetch as jest.Mock).mockReset()
    mockSuccessfulFetch()
  })

  afterEach(() => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: originalAudioContext,
      writable: true,
    })
  })

  it('preloads configured assets and reuses decoded buffers for playback', async () => {
    const { playSfx, preloadSfx } = await import('../audio/audioManager')

    await preloadSfx()
    playSfx('car-park-success')
    await flushAudioPromises()

    const context = createdContexts[0]
    expect(globalThis.fetch).toHaveBeenCalledTimes(AUDIO_ASSET_NAMES.length)
    expect(context?.resume).toHaveBeenCalledTimes(1)
    expect(context?.sources).toHaveLength(1)
    expect(context?.sources[0]?.buffer).toBe(fakeAudioBuffer)
    expect(context?.sources[0]?.connect).toHaveBeenCalledWith(context?.gainNode)
    expect(context?.sources[0]?.start).toHaveBeenCalledTimes(1)
    expect(context?.gainNode.connect).toHaveBeenCalledWith(context?.destination)
  })

  it('applies muted state through the master gain node', async () => {
    const { playSfx, setMuted } = await import('../audio/audioManager')

    setMuted(true)
    playSfx('passenger-board')
    await flushAudioPromises()

    const context = createdContexts[0]
    expect(context?.gainNode.gain.value).toBe(0)

    setMuted(false)

    expect(context?.gainNode.gain.value).toBe(1)
  })
})

function mockSuccessfulFetch(): void {
  ;(globalThis.fetch as jest.Mock).mockResolvedValue({
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
    ok: true,
  })
}

async function flushAudioPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}
