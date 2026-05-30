import { inflateSync } from 'node:zlib'

import { expect, type Locator, type Page, test } from '@playwright/test'

const CARS_TUTORIAL_STORAGE_KEY = 'bwh.cars-game.tutorial-seen.v1'
const GAME_PROGRESS_STORAGE_KEY = 'bwh.cars-game.progress.v2'
const LEVEL_SNAPSHOT_STORAGE_KEY = 'bwh.cars-game.snapshot.v2'

interface PngImage {
  height: number
  pixels: Uint8Array
  width: number
}

interface Region {
  height: number
  width: number
  x: number
  y: number
}

test.describe('Parking Pickup visual smoke', () => {
  test.beforeEach(async ({ page }) => {
    await skipTutorial(page)
  })

  test('renders the parking, feeder, and board regions without the tutorial overlay', async ({ page }, testInfo) => {
    await page.goto('/games/parking-pickup')

    await expect(page.getByText(/Level 1 is ready/)).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible()
    await waitForCanvasRender(canvas)

    const screenshot = await canvas.screenshot()
    await testInfo.attach(`parking-pickup-${testInfo.project.name}.png`, {
      body: screenshot,
      contentType: 'image/png',
    })

    const image = parsePng(screenshot)
    const topRegion = regionFor(image, 0, 0, 1, 0.42)
    const parkingRegion = regionFor(image, 0, 0.34, 1, 0.24)
    const boardRegion = regionFor(image, 0.08, 0.58, 0.84, 0.32)

    expect(pixelRatio(image, topRegion, isGrassPixel)).toBeGreaterThan(0.35)
    expect(pixelRatio(image, parkingRegion, isAsphaltPixel)).toBeGreaterThan(0.18)
    expect(pixelRatio(image, boardRegion, isLightBoardPixel)).toBeGreaterThan(0.2)
  })

  test('exposes the styled power-up and action controls', async ({ page }) => {
    await page.goto('/games/parking-pickup')

    await expect(page.getByText(/Level 1 is ready/)).toBeVisible()
    for (const name of ['VIP', 'Shuffle', 'Fill', 'Open Spot', 'Reset', 'Tutorial']) {
      await expect(page.getByRole('button', { name })).toBeVisible()
    }
  })

  test('keeps playfield framing stable through level completion', async ({ page }, testInfo) => {
    await loadNearCompleteLevel(page)
    await page.goto('/games/parking-pickup')

    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible()
    await waitForCanvasRender(canvas)

    const beforeBox = await canvas.boundingBox()
    const beforeScreenshot = await canvas.screenshot()
    const beforeMetrics = visualLayoutMetrics(parsePng(beforeScreenshot))
    await testInfo.attach(`parking-pickup-before-complete-${testInfo.project.name}.png`, {
      body: beforeScreenshot,
      contentType: 'image/png',
    })

    await page.getByRole('button', { name: 'Fill' }).click()
    await page.getByRole('button', { name: 'Use Fill' }).click()

    await expect(page.getByRole('heading', { name: 'Level 1 Complete' })).toBeVisible()
    await page.addStyleTag({ content: '[role="dialog"] { display: none !important; }' })
    await page.waitForTimeout(700)

    const afterBox = await canvas.boundingBox()
    const afterScreenshot = await canvas.screenshot()
    const afterMetrics = visualLayoutMetrics(parsePng(afterScreenshot))
    await testInfo.attach(`parking-pickup-after-complete-${testInfo.project.name}.png`, {
      body: afterScreenshot,
      contentType: 'image/png',
    })

    expect(afterBox?.width).toBeCloseTo(beforeBox?.width ?? 0, 0)
    expect(afterBox?.height).toBeCloseTo(beforeBox?.height ?? 0, 0)
    expect(afterMetrics.asphaltRatio).toBeGreaterThan(0.18)
    expect(afterMetrics.boardRatio).toBeGreaterThan(0.2)
    expect(Math.abs(afterMetrics.asphaltRatio - beforeMetrics.asphaltRatio)).toBeLessThan(0.08)
    expect(Math.abs(afterMetrics.boardRatio - beforeMetrics.boardRatio)).toBeLessThan(0.1)
  })
})

async function skipTutorial(page: Page): Promise<void> {
  await page.addInitScript(
    ({ progressKey, snapshotKey, tutorialKey }) => {
      window.localStorage.setItem(tutorialKey, '1')
      window.localStorage.removeItem(progressKey)
      window.localStorage.removeItem(snapshotKey)
    },
    {
      progressKey: GAME_PROGRESS_STORAGE_KEY,
      snapshotKey: LEVEL_SNAPSHOT_STORAGE_KEY,
      tutorialKey: CARS_TUTORIAL_STORAGE_KEY,
    },
  )
}

async function loadNearCompleteLevel(page: Page): Promise<void> {
  await page.addInitScript(
    ({ progressKey, snapshotKey }) => {
      const parkingSlots = [
        { id: 'vip', kind: 'vip', unlocked: true, occupiedCarId: null, index: -1 },
        { id: 'slot-1', kind: 'regular', unlocked: true, occupiedCarId: 'red-car', index: 0 },
        { id: 'slot-2', kind: 'regular', unlocked: true, occupiedCarId: null, index: 1 },
        { id: 'slot-3', kind: 'regular', unlocked: true, occupiedCarId: null, index: 2 },
        { id: 'slot-4', kind: 'regular', unlocked: true, occupiedCarId: null, index: 3 },
        { id: 'slot-5', kind: 'regular', unlocked: false, occupiedCarId: null, index: 4 },
        { id: 'slot-6', kind: 'regular', unlocked: false, occupiedCarId: null, index: 5 },
        { id: 'slot-7', kind: 'regular', unlocked: false, occupiedCarId: null, index: 6 },
      ]
      const state = {
        version: 2,
        level: 1,
        seed: 12345,
        boardWidth: 24,
        boardHeight: 16,
        cars: [{
          id: 'red-car',
          color: 'red',
          colorHidden: false,
          direction: 'right',
          capacity: 4,
          length: 2,
          position: { x: 0, y: 0 },
          status: 'parked',
          parkingSlotId: 'slot-1',
          boarded: 0,
          tunnelId: null,
          sequence: 0,
        }],
        tunnels: [],
        passengerQueue: Array.from({ length: 4 }, (_, index) => ({
          id: `red-passenger-${index}`,
          color: 'red',
        })),
        parkingSlots,
        powerUps: { vip: 0, shuffle: 0, fill: 1 },
        levelScore: 0,
        totalScore: 0,
        highScore: 0,
        moves: 1,
        maxRegularSlotsUsed: 1,
        maxRegularSlotsUnlocked: 4,
        lastMessage: 'Ready to complete.',
        completedLevel: null,
        failedLevel: null,
      }

      window.localStorage.setItem(progressKey, JSON.stringify({
        version: 2,
        level: 1,
        totalScore: 0,
        highScore: 0,
        powerUps: { vip: 0, shuffle: 0, fill: 1 },
      }))
      window.localStorage.setItem(snapshotKey, JSON.stringify({ version: 2, state }))
    },
    {
      progressKey: GAME_PROGRESS_STORAGE_KEY,
      snapshotKey: LEVEL_SNAPSHOT_STORAGE_KEY,
    },
  )
}

async function waitForCanvasRender(canvas: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const box = await canvas.boundingBox()

      return box === null ? 0 : Math.min(box.width, box.height)
    })
    .toBeGreaterThan(100)
}

function parsePng(buffer: Buffer): PngImage {
  const signature = buffer.subarray(0, 8)

  if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Invalid PNG signature')
  }

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks: Buffer[] = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8] ?? 0
      colorType = data[9] ?? 0
    } else if (type === 'IDAT') {
      idatChunks.push(data)
    } else if (type === 'IEND') {
      break
    }

    offset += length + 12
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format: bit depth ${bitDepth}, color type ${colorType}`)
  }

  return unpackPngPixels(inflateSync(Buffer.concat(idatChunks)), width, height, colorType === 6 ? 4 : 3)
}

function unpackPngPixels(raw: Buffer, width: number, height: number, bytesPerPixel: number): PngImage {
  const stride = width * bytesPerPixel
  const pixels = new Uint8Array(width * height * 4)
  let rawOffset = 0
  let previous = Buffer.alloc(stride)

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset] ?? 0
    rawOffset += 1

    const scanline = Buffer.from(raw.subarray(rawOffset, rawOffset + stride))
    rawOffset += stride

    unfilterScanline(scanline, previous, bytesPerPixel, filter)

    for (let x = 0; x < width; x += 1) {
      const source = x * bytesPerPixel
      const target = (y * width + x) * 4

      pixels[target] = scanline[source] ?? 0
      pixels[target + 1] = scanline[source + 1] ?? 0
      pixels[target + 2] = scanline[source + 2] ?? 0
      pixels[target + 3] = bytesPerPixel === 4 ? (scanline[source + 3] ?? 255) : 255
    }

    previous = scanline
  }

  return { height, pixels, width }
}

function unfilterScanline(scanline: Buffer, previous: Buffer, bytesPerPixel: number, filter: number): void {
  for (let index = 0; index < scanline.length; index += 1) {
    const left = index >= bytesPerPixel ? (scanline[index - bytesPerPixel] ?? 0) : 0
    const up = previous[index] ?? 0
    const upLeft = index >= bytesPerPixel ? (previous[index - bytesPerPixel] ?? 0) : 0
    const value = scanline[index] ?? 0

    if (filter === 1) {
      scanline[index] = (value + left) & 0xff
    } else if (filter === 2) {
      scanline[index] = (value + up) & 0xff
    } else if (filter === 3) {
      scanline[index] = (value + Math.floor((left + up) / 2)) & 0xff
    } else if (filter === 4) {
      scanline[index] = (value + paeth(left, up, upLeft)) & 0xff
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter: ${filter}`)
    }
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upLeftDistance = Math.abs(estimate - upLeft)

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left
  }

  return upDistance <= upLeftDistance ? up : upLeft
}

function regionFor(image: PngImage, x: number, y: number, width: number, height: number): Region {
  return {
    height: Math.max(1, Math.floor(image.height * height)),
    width: Math.max(1, Math.floor(image.width * width)),
    x: Math.floor(image.width * x),
    y: Math.floor(image.height * y),
  }
}

function pixelRatio(
  image: PngImage,
  region: Region,
  predicate: (red: number, green: number, blue: number, alpha: number) => boolean,
): number {
  let matching = 0
  let total = 0

  for (let y = region.y; y < Math.min(image.height, region.y + region.height); y += 1) {
    for (let x = region.x; x < Math.min(image.width, region.x + region.width); x += 1) {
      const index = (y * image.width + x) * 4
      const red = image.pixels[index] ?? 0
      const green = image.pixels[index + 1] ?? 0
      const blue = image.pixels[index + 2] ?? 0
      const alpha = image.pixels[index + 3] ?? 0

      total += 1

      if (predicate(red, green, blue, alpha)) {
        matching += 1
      }
    }
  }

  return total === 0 ? 0 : matching / total
}

function visualLayoutMetrics(image: PngImage): { asphaltRatio: number, boardRatio: number } {
  return {
    asphaltRatio: pixelRatio(image, regionFor(image, 0, 0.34, 1, 0.24), isAsphaltPixel),
    boardRatio: pixelRatio(image, regionFor(image, 0.08, 0.58, 0.84, 0.32), isLightBoardPixel),
  }
}

function isGrassPixel(red: number, green: number, blue: number, alpha: number): boolean {
  return alpha > 240 && green > 145 && green > red + 25 && green > blue + 25
}

function isAsphaltPixel(red: number, green: number, blue: number, alpha: number): boolean {
  return alpha > 240 && red >= 70 && red <= 170 && green >= 80 && green <= 180 && blue >= 95 && blue <= 200
}

function isLightBoardPixel(red: number, green: number, blue: number, alpha: number): boolean {
  return alpha > 240 && red > 220 && green > 225 && blue > 225
}
