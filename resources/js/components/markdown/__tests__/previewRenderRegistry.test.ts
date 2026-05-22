import { createPreviewRenderRegistry } from '../previewRenderRegistry'

describe('createPreviewRenderRegistry', () => {
  it('resolves waitUntilSettled immediately when nothing is pending', async () => {
    const registry = createPreviewRenderRegistry()
    registry.resetForRevision('a')
    await expect(registry.waitUntilSettled()).resolves.toBeUndefined()
  })

  it('waits until every pending key settles', async () => {
    const registry = createPreviewRenderRegistry()
    registry.resetForRevision('a')
    registry.registerPending('one')
    registry.registerPending('two')

    let settled = false
    const promise = registry.waitUntilSettled().then(() => {
      settled = true
    })

    registry.markSettled('one')
    await Promise.resolve()
    expect(settled).toBe(false)

    registry.markSettled('two')
    await promise
    expect(settled).toBe(true)
  })

  it('ignores late markSettled calls from a previous revision', async () => {
    const registry = createPreviewRenderRegistry()
    registry.resetForRevision('rev-1')
    registry.registerPending('block')

    registry.resetForRevision('rev-2')
    registry.markSettled('block')

    await expect(registry.waitUntilSettled()).resolves.toBeUndefined()
  })

  it('resetForRevision unblocks waiters when pending is cleared', async () => {
    const registry = createPreviewRenderRegistry()
    registry.resetForRevision('rev-1')
    registry.registerPending('block')

    let settled = false
    const promise = registry.waitUntilSettled().then(() => {
      settled = true
    })

    registry.resetForRevision('rev-2')
    await promise
    expect(settled).toBe(true)
  })
})
