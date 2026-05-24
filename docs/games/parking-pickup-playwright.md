# Parking Pickup Playwright Checks

These checks are intentionally ad-hoc. They do not run on every pull request.

## Local

Start the app on `localhost:8000`, then run:

```bash
pnpm install --frozen-lockfile --prefer-offline
pnpm exec playwright install chromium
pnpm run test:e2e:parking-pickup
```

Use `PLAYWRIGHT_BASE_URL` to point at a different server:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000 pnpm run test:e2e:parking-pickup
```

The test skips the tutorial through `localStorage`, renders the game at desktop and mobile viewports, attaches canvas screenshots, and checks that the queue/grass, parking asphalt, and board-grid regions are present.

## GitHub Actions

Run **Parking Pickup Playwright** manually from the Actions tab:

1. Open **Actions**.
2. Select **Parking Pickup Playwright**.
3. Click **Run workflow**.
4. Choose the branch to verify.
5. Leave `base_url` blank to build the selected branch and serve it on the runner.

To check a deployed preview or another reachable URL, set `base_url` to that origin, for example:

```text
https://example-preview.test
```

The workflow uploads the Playwright HTML report, failure traces, screenshots, and the local Laravel server log as a `parking-pickup-playwright-report` artifact.
