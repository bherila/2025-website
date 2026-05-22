export interface PreviewRenderRegistry {
  resetForRevision(revision: string): void
  registerPending(key: string): void
  markSettled(key: string): void
  waitUntilSettled(): Promise<void>
  getCurrentRevision(): string
}

export function createPreviewRenderRegistry(): PreviewRenderRegistry {
  let revision = ''
  const pending = new Set<string>()
  let waiters: Array<() => void> = []

  const flushIfEmpty = (): void => {
    if (pending.size === 0 && waiters.length > 0) {
      const toResolve = waiters
      waiters = []
      for (const resolve of toResolve) {
        resolve()
      }
    }
  }

  const buildKey = (key: string): string => `${revision}::${key}`

  return {
    resetForRevision(nextRevision: string): void {
      revision = nextRevision
      pending.clear()
      flushIfEmpty()
    },

    registerPending(key: string): void {
      pending.add(buildKey(key))
    },

    markSettled(key: string): void {
      pending.delete(buildKey(key))
      flushIfEmpty()
    },

    waitUntilSettled(): Promise<void> {
      if (pending.size === 0) {
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => {
        waiters.push(resolve)
      })
    },

    getCurrentRevision(): string {
      return revision
    },
  }
}
