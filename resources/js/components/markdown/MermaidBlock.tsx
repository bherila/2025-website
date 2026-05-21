import { useContext, useEffect, useId, useState } from 'react'

import { loadMermaid } from './mermaidLoader'
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

export function MermaidBlock({ code }: MermaidBlockProps): React.JSX.Element {
  const registry = useContext(PreviewRenderRegistryContext)
  const blockKey = useId()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    const key = `mermaid:${blockKey}`
    registry?.registerPending(key)

    ;(async () => {
      try {
        const mermaid = await loadMermaid()
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
  }, [code, blockKey, registry])

  if (state.kind === 'rendered') {
    return (
      <div
        className="mermaid-block my-4 flex justify-center rounded-md bg-white p-3 ring-1 ring-neutral-200"
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
        <pre className="mt-2 overflow-x-auto text-xs text-neutral-700">{code}</pre>
      </div>
    )
  }

  return (
    <div className="mermaid-block my-4 rounded-md bg-neutral-50 p-3 text-sm text-neutral-500 ring-1 ring-neutral-200">
      Rendering diagram…
    </div>
  )
}
