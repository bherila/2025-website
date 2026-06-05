import { useEffect } from 'react'

interface UseScrollAndHighlightOptions {
  selector: string | null | undefined
  triggerKey: unknown
  enabled?: boolean
  delayMs?: number
  durationMs?: number
  highlightClassName?: string
}

const DEFAULT_DELAY_MS = 200
const DEFAULT_DURATION_MS = 3000
const DEFAULT_HIGHLIGHT_CLASS = 'scroll-highlight-flash'

export function useScrollAndHighlight({
  selector,
  triggerKey,
  enabled = true,
  delayMs = DEFAULT_DELAY_MS,
  durationMs = DEFAULT_DURATION_MS,
  highlightClassName = DEFAULT_HIGHLIGHT_CLASS,
}: UseScrollAndHighlightOptions): void {
  useEffect(() => {
    if (!enabled || !selector || typeof document === 'undefined') {
      return
    }

    let cleanupTimer: ReturnType<typeof window.setTimeout> | null = null
    const startTimer = window.setTimeout(() => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) {
        return
      }

      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element.classList.add(highlightClassName)
      cleanupTimer = window.setTimeout(() => {
        element.classList.remove(highlightClassName)
      }, durationMs)
    }, delayMs)

    return () => {
      window.clearTimeout(startTimer)
      if (cleanupTimer !== null) {
        window.clearTimeout(cleanupTimer)
      }
    }
  }, [delayMs, durationMs, enabled, highlightClassName, selector, triggerKey])
}
