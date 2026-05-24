import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect, test } from '@playwright/test'

interface VisualReadyState {
  frameCount: number
  level: number
  renderedAt: number
  seed: string | null
}

declare global {
  interface Window {
    __PARKING_PICKUP_VISUAL_READY__?: boolean
    __PARKING_PICKUP_VISUAL_STATE__?: VisualReadyState
  }
}

const SCENARIOS = [
  {
    name: 'level-1',
    url:
      '/games/parking-pickup?visualTest=1&level=1&seed=parking-style-a&hud=compact&reducedMotion=1',
  },
  {
    name: 'level-8',
    url:
      '/games/parking-pickup?visualTest=1&level=8&seed=parking-style-a&hud=compact&reducedMotion=1',
  },
  {
    name: 'level-20',
    url:
      '/games/parking-pickup?visualTest=1&level=20&seed=parking-style-a&hud=compact&reducedMotion=1',
  },
] as const

const SCREENSHOT_DIR = path.join('test-results', 'parking-pickup')

test.describe('Parking Pickup visual harness', () => {
  for (const scenario of SCENARIOS) {
    test(`captures ${scenario.name}`, async ({ page }, testInfo) => {
      await page.goto(scenario.url)

      await page.waitForFunction(() => window.__PARKING_PICKUP_VISUAL_READY__ === true, undefined, {
        timeout: 30_000,
      })

      const readyState = await page.evaluate(() => window.__PARKING_PICKUP_VISUAL_STATE__)
      expect(readyState).toBeDefined()
      expect(readyState?.level).toBe(scenarioLevel(scenario.name))

      const canvas = page.locator('canvas').first()
      await expect(canvas).toBeVisible()

      const screenshot = await page.screenshot({ fullPage: false })
      const filename = `${scenario.name}-${testInfo.project.name}.png`

      await testInfo.attach(filename, {
        body: screenshot,
        contentType: 'image/png',
      })

      await mkdir(SCREENSHOT_DIR, { recursive: true })
      await writeFile(path.join(SCREENSHOT_DIR, filename), screenshot)
    })
  }

  test('visualTest mode does not write to the saved progress key', async ({ page }) => {
    await page.goto(
      '/games/parking-pickup?visualTest=1&level=8&seed=parking-style-a&hud=compact&reducedMotion=1',
    )

    await page.waitForFunction(() => window.__PARKING_PICKUP_VISUAL_READY__ === true, undefined, {
      timeout: 30_000,
    })

    const progress = await page.evaluate(() => window.localStorage.getItem('bwh.cars-game.progress.v2'))
    const snapshot = await page.evaluate(() => window.localStorage.getItem('bwh.cars-game.snapshot.v2'))

    expect(progress).toBeNull()
    expect(snapshot).toBeNull()
  })
})

function scenarioLevel(name: (typeof SCENARIOS)[number]['name']): number {
  switch (name) {
    case 'level-1': {
      return 1
    }
    case 'level-8': {
      return 8
    }
    case 'level-20': {
      return 20
    }
  }
}
