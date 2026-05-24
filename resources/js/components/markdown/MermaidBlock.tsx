import mermaid from 'mermaid'
import { useContext, useEffect, useId, useState } from 'react'

import { PreviewRenderRegistryContext } from './PreviewContext'
import { sanitizeSvgMarkup } from './sanitizeSvg'

interface MermaidBlockProps {
  code: string
}

type State =
  | { kind: 'loading' }
  | { kind: 'rendered'; svg: string }
  | { kind: 'error'; message: string }

let renderCounter = 0
let initializedTheme: 'dark' | 'default' | null = null

function ensureMermaidInitialized(theme: 'dark' | 'default'): void {
  if (initializedTheme === theme) {
    return
  }
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
    htmlLabels: false,
  })
  initializedTheme = theme
}

function readIsDark(): boolean {
  if (typeof document === 'undefined') {
    return false
  }
  return document.documentElement.classList.contains('dark')
}

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState<boolean>(readIsDark)

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
      return
    }
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains('dark'))
    })
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return isDark
}

export function MermaidBlock({ code }: MermaidBlockProps): React.JSX.Element {
  const registry = useContext(PreviewRenderRegistryContext)
  const blockKey = useId()
  const isDark = useIsDarkMode()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    const key = `mermaid:${blockKey}`
    registry?.registerPending(key)

    ;(async () => {
      try {
        ensureMermaidInitialized(isDark ? 'dark' : 'default')

        renderCounter += 1
        const renderId = `mermaid-${Date.now()}-${renderCounter}`
        const { svg } = await mermaid.render(renderId, code)
        if (!cancelled) {
          setState({ kind: 'rendered', svg: sanitizeSvgMarkup(svg) })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to render Mermaid diagram'
        if (!cancelled) {
          setState({ kind: 'error', message })
        }
      } finally {
        registry?.markSettled(key)
      }
    })()

    return () => {
      cancelled = true
      registry?.markSettled(key)
    }
  }, [code, blockKey, registry, isDark])

  if (state.kind === 'rendered') {
    return (
      <div
        className="mermaid-block my-4 flex justify-center rounded-md bg-card p-3 ring-1 ring-border"
        dangerouslySetInnerHTML={{ __html: state.svg }}
      />
    )
  }

  if (state.kind === 'error') {
    return (
      <div
        className="mermaid-block my-4 rounded-md border border-destructive bg-destructive/5 p-3"
        data-mermaid-error="true"
      >
        <p className="text-sm font-semibold text-destructive">Mermaid diagram error</p>
        <pre className="mt-1 overflow-x-auto text-xs text-destructive">{state.message}</pre>
        <pre className="mt-2 overflow-x-auto text-xs text-muted-foreground">{code}</pre>
      </div>
    )
  }

  return (
    <div className="mermaid-block my-4 rounded-md bg-muted p-3 text-sm text-muted-foreground ring-1 ring-border">
      Rendering diagram…
    </div>
  )
}
