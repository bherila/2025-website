import { readFileSync } from 'node:fs'

import { expect, type Page, test } from '@playwright/test'

interface ReconciliationFixture {
  login_path: string
  reconciliation_path: string
  tax_document_id: number
  tax_year: number
  user_id: number
}

test.describe('lot reconciliation review flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsFixtureOwner(page)
  })

  test('mismatched row can be accepted as an account override', async ({ page, isMobile }) => {
    test.skip(isMobile, 'review action coverage mutates the shared fixture and runs once on desktop')

    const fixture = readFixture()
    await page.goto(fixture.reconciliation_path)

    const mismatched = page.getByTestId('recon-bucket-mismatched')
    await expect(mismatched).toBeVisible()

    const row = mismatched.getByTestId(/^recon-row-/).first()
    await expect(row).toBeVisible()
    const rowTestId = await row.getAttribute('data-testid')
    expect(rowTestId).toBeTruthy()
    await expect(row).toHaveAttribute('data-link-state', 'needs_review')

    await expect(page.getByTestId('recon-summary-needs-review-value')).toContainText('1')

    await row.getByTestId('recon-row-actions').click()

    const linksRefresh = page.waitForResponse((response) => (
      response.url().includes(`/api/finance/tax-documents/${fixture.tax_document_id}/lot-reconciliation-links`)
      && response.request().method() === 'GET'
    ))
    await page.getByTestId('recon-action-accept-account-override').click()
    await linksRefresh

    const movedRow = page.getByTestId(rowTestId!)
    await expect(movedRow).toHaveAttribute('data-link-state', 'accepted_account_override')
    await expect(page.getByTestId('recon-bucket-matched').getByTestId(rowTestId!)).toHaveCount(1)
    await expect(mismatched.getByTestId(rowTestId!)).toHaveCount(0)
    await expect(page.getByTestId('recon-summary-needs-review-value')).toContainText('0')
  })

  test('375px review page renders without horizontal overflow', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile smoke coverage runs on the mobile project')

    const fixture = readFixture()
    await page.goto(fixture.reconciliation_path)

    await expect(page.getByTestId('recon-status-summary')).toBeVisible()
    await expect(page.getByTestId('recon-bucket-mismatched')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('375px tax preview health widget links to the review page', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile smoke coverage runs on the mobile project')

    const fixture = readFixture()
    await page.goto(`/finance/tax-preview?year=${fixture.tax_year}`)

    const widget = page.getByTestId('recon-health-widget')
    await expect(widget).toBeVisible()

    const row = widget.getByTestId(`recon-health-row-${fixture.tax_document_id}`)
    await expect(row).toHaveAttribute('data-dashboard-status', 'drift')
    await expect(row).toHaveAttribute('href', fixture.reconciliation_path)
    await expect(row).toContainText(/drift - max delta/i)
    await expectNoHorizontalOverflow(page)

    await Promise.all([
      page.waitForURL(new RegExp(`/finance/tax-documents/${fixture.tax_document_id}/lot-reconciliation$`)),
      row.dispatchEvent('click'),
    ])
  })
})

async function loginAsFixtureOwner(page: Page): Promise<void> {
  const fixture = readFixture()

  await page.goto('/login')
  const csrfToken = await page.locator('input[name="_token"]').first().inputValue()

  const response = await page.request.post(fixture.login_path, {
    form: {
      _token: csrfToken,
      user_id: String(fixture.user_id),
    },
  })
  expect(response.ok(), `Expected fixture login to succeed, got HTTP ${response.status()}`).toBe(true)
}

function readFixture(): ReconciliationFixture {
  const fixtureRaw = process.env.RECON_FIXTURE_JSON
    ?? readFileSync('tests/e2e/.fixture-state.json', 'utf8')

  return JSON.parse(fixtureRaw) as ReconciliationFixture
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}
