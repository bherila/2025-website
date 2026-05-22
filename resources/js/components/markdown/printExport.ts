import type { PreviewRenderRegistry } from './previewRenderRegistry'

function nextAnimationFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
    } else {
      setTimeout(resolve, 16)
    }
  })
}

async function waitForImages(root: HTMLElement | null): Promise<void> {
  if (!root) {
    return
  }
  const images = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) {
        return Promise.resolve()
      }
      if (typeof img.decode === 'function') {
        return img.decode().catch(() => undefined)
      }
      return new Promise<void>((resolve) => {
        const done = () => resolve()
        img.addEventListener('load', done, { once: true })
        img.addEventListener('error', done, { once: true })
      })
    }),
  )
}

export interface PrintDeps {
  print?: () => void
  fonts?: { ready: Promise<unknown> }
  /** Max time to wait for async preview blocks (Mermaid/Shiki) before printing anyway. */
  settleTimeoutMs?: number
}

const DEFAULT_SETTLE_TIMEOUT_MS = 10_000

function waitWithTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    const settle = (): void => {
      clearTimeout(timer)
      resolve()
    }
    promise.then(settle, settle)
  })
}

export async function prepareAndPrint(
  registry: PreviewRenderRegistry,
  previewEl: HTMLElement | null,
  deps: PrintDeps = {},
): Promise<void> {
  const settleTimeoutMs = deps.settleTimeoutMs ?? DEFAULT_SETTLE_TIMEOUT_MS
  await waitWithTimeout(registry.waitUntilSettled(), settleTimeoutMs)
  await waitForImages(previewEl)

  const fonts = deps.fonts ?? (typeof document !== 'undefined' && 'fonts' in document ? (document.fonts as unknown as { ready: Promise<unknown> }) : undefined)
  if (fonts?.ready) {
    try {
      await fonts.ready
    } catch {
      // ignore font loading failures; don't block print
    }
  }

  await nextAnimationFrame()
  await nextAnimationFrame()

  const printFn = deps.print ?? (typeof window !== 'undefined' ? window.print.bind(window) : undefined)
  if (printFn) {
    printFn()
  }
}
