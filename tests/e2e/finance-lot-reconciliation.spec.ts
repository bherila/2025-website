import { expect, test } from '@playwright/test'

test('lot reconciliation fixture shows drift and grouped buckets', async ({ page }) => {
  const fixtureRaw = process.env.RECON_FIXTURE_JSON
  expect(fixtureRaw, 'RECON_FIXTURE_JSON env var is required').toBeTruthy()
  const fixture = JSON.parse(fixtureRaw ?? '{}') as { user_id: number; reconciliation_path: string }

  await page.request.post('/login/dev-by-id', {
    form: { user_id: String(fixture.user_id) },
  })

  await page.goto(fixture.reconciliation_path)
  await expect(page.getByTestId('recon-health-widget')).toBeVisible()
  await expect(page.getByText('Drift')).toBeVisible()
  await expect(page.getByTestId('recon-bucket-matched')).toBeVisible()

  const firstAction = page.locator('[data-testid^="recon-row-actions-"]').first()
  await expect(firstAction).toBeVisible()
})
