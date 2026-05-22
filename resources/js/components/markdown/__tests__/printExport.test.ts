import { createPreviewRenderRegistry } from '../previewRenderRegistry'
import { prepareAndPrint } from '../printExport'

describe('prepareAndPrint', () => {
  it('does not call print until the registry has settled', async () => {
    const registry = createPreviewRenderRegistry()
    registry.resetForRevision('rev')
    registry.registerPending('mermaid')

    const print = jest.fn()
    const fontsReady = Promise.resolve()
    const previewEl = document.createElement('div')

    const completion = prepareAndPrint(registry, previewEl, {
      print,
      fonts: { ready: fontsReady },
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(print).not.toHaveBeenCalled()

    registry.markSettled('mermaid')
    await completion
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('awaits document.fonts.ready before printing', async () => {
    const registry = createPreviewRenderRegistry()
    registry.resetForRevision('rev')

    let resolveFonts: () => void = () => {}
    const fontsReady = new Promise<void>((resolve) => {
      resolveFonts = resolve
    })

    const print = jest.fn()
    const previewEl = document.createElement('div')

    const completion = prepareAndPrint(registry, previewEl, {
      print,
      fonts: { ready: fontsReady },
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(print).not.toHaveBeenCalled()

    resolveFonts()
    await completion
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('prints anyway after settleTimeoutMs if a pending block never resolves', async () => {
    const registry = createPreviewRenderRegistry()
    registry.resetForRevision('rev')
    registry.registerPending('hung-mermaid')

    const print = jest.fn()
    const previewEl = document.createElement('div')

    await prepareAndPrint(registry, previewEl, {
      print,
      fonts: { ready: Promise.resolve() },
      settleTimeoutMs: 5,
    })

    expect(print).toHaveBeenCalledTimes(1)
  })
})
