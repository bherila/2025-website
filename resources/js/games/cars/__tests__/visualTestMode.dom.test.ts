import {
  markParkingPickupVisualReady,
  readParkingPickupVisualTestOptions,
  resetParkingPickupVisualReadiness,
} from '../visualTestMode'

describe('readParkingPickupVisualTestOptions', () => {
  it('returns disabled defaults when visualTest is absent', () => {
    const options = readParkingPickupVisualTestOptions('')

    expect(options).toEqual({
      colorblind: null,
      enabled: false,
      hud: 'compact',
      level: null,
      reducedMotion: false,
      seed: null,
    })
  })

  it('does not enable mode without explicit visualTest=1', () => {
    expect(readParkingPickupVisualTestOptions('?visualTest=0').enabled).toBe(false)
    expect(readParkingPickupVisualTestOptions('?visualTest=true').enabled).toBe(false)
    expect(readParkingPickupVisualTestOptions('?level=1').enabled).toBe(false)
  })

  it('parses a fully-specified URL', () => {
    const options = readParkingPickupVisualTestOptions(
      '?visualTest=1&level=8&seed=parking-style-a&hud=compact&reducedMotion=1&colorblind=1',
    )

    expect(options).toEqual({
      colorblind: true,
      enabled: true,
      hud: 'compact',
      level: 8,
      reducedMotion: true,
      seed: 'parking-style-a',
    })
  })

  it('parses colorblind=0 as an explicit off', () => {
    expect(readParkingPickupVisualTestOptions('?visualTest=1&colorblind=0').colorblind).toBe(false)
  })

  it('floors fractional levels and ignores invalid ones', () => {
    expect(readParkingPickupVisualTestOptions('?visualTest=1&level=8.9').level).toBe(8)
    expect(readParkingPickupVisualTestOptions('?visualTest=1&level=0').level).toBeNull()
    expect(readParkingPickupVisualTestOptions('?visualTest=1&level=-3').level).toBeNull()
    expect(readParkingPickupVisualTestOptions('?visualTest=1&level=abc').level).toBeNull()
  })

  it('defaults to compact and only treats hud=normal as normal', () => {
    expect(readParkingPickupVisualTestOptions('?visualTest=1&hud=normal').hud).toBe('normal')
    expect(readParkingPickupVisualTestOptions('?visualTest=1&hud=compact').hud).toBe('compact')
    expect(readParkingPickupVisualTestOptions('?visualTest=1&hud=expanded').hud).toBe('compact')
    expect(readParkingPickupVisualTestOptions('?visualTest=1').hud).toBe('compact')
  })

  it('only treats reducedMotion=1 as enabled', () => {
    expect(readParkingPickupVisualTestOptions('?visualTest=1&reducedMotion=1').reducedMotion).toBe(true)
    expect(readParkingPickupVisualTestOptions('?visualTest=1&reducedMotion=true').reducedMotion).toBe(false)
    expect(readParkingPickupVisualTestOptions('?visualTest=1').reducedMotion).toBe(false)
  })
})

describe('readiness marker helpers', () => {
  afterEach(() => {
    resetParkingPickupVisualReadiness()
  })

  it('initializes ready=false and clears state', () => {
    window.__PARKING_PICKUP_VISUAL_READY__ = true
    window.__PARKING_PICKUP_VISUAL_STATE__ = {
      frameCount: 5,
      level: 2,
      renderedAt: 1000,
      seed: 'x',
    }

    resetParkingPickupVisualReadiness()

    expect(window.__PARKING_PICKUP_VISUAL_READY__).toBe(false)
    expect(window.__PARKING_PICKUP_VISUAL_STATE__).toBeUndefined()
  })

  it('marks ready with the rendered state', () => {
    markParkingPickupVisualReady({
      frameCount: 3,
      level: 8,
      renderedAt: 1234,
      seed: 'parking-style-a',
    })

    expect(window.__PARKING_PICKUP_VISUAL_READY__).toBe(true)
    expect(window.__PARKING_PICKUP_VISUAL_STATE__).toEqual({
      frameCount: 3,
      level: 8,
      renderedAt: 1234,
      seed: 'parking-style-a',
    })
  })
})
