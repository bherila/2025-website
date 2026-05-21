import { useContext, useEffect, useId, useState } from 'react'

import { PreviewRenderRegistryContext } from './PreviewContext'
import { loadShiki, type ShikiToken, type ShikiTokenLine } from './shikiLoader'

function normalizeTokenLines(input: { tokens: ShikiToken[][] } | { tokens: ShikiTokenLine[] }): ShikiToken[][] {
  const lines = input.tokens
  if (lines.length === 0) {
    return []
  }
  const first = lines[0] as ShikiToken[] | ShikiTokenLine
  if (Array.isArray(first)) {
    return lines as ShikiToken[][]
  }
  return (lines as ShikiTokenLine[]).map((line) => line.tokens)
}

const FONT_STYLE_BITS = {
  Italic: 1,
  Bold: 2,
  Underline: 4,
}

function tokenStyle(token: ShikiToken): React.CSSProperties {
  const style: React.CSSProperties = {}
  if (token.color) {
    style.color = token.color
  }
  if (token.bgColor) {
    style.backgroundColor = token.bgColor
  }
  if (token.fontStyle) {
    if ((token.fontStyle & FONT_STYLE_BITS.Italic) !== 0) {
      style.fontStyle = 'italic'
    }
    if ((token.fontStyle & FONT_STYLE_BITS.Bold) !== 0) {
      style.fontWeight = 'bold'
    }
    if ((token.fontStyle & FONT_STYLE_BITS.Underline) !== 0) {
      style.textDecoration = 'underline'
    }
  }
  return style
}

interface ShikiBlockProps {
  code: string
  lang: string
}

type State =
  | { kind: 'loading' }
  | { kind: 'rendered'; lines: ShikiToken[][] }
  | { kind: 'fallback' }

export function ShikiBlock({ code, lang }: ShikiBlockProps): React.JSX.Element {
  const registry = useContext(PreviewRenderRegistryContext)
  const blockKey = useId()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    const key = `shiki:${blockKey}`
    registry?.registerPending(key)

    ;(async () => {
      try {
        const shiki = await loadShiki()
        const supported = lang && lang in (shiki.bundledLanguages ?? {})
        const result = await shiki.codeToTokens(code, {
          lang: supported ? lang : 'text',
          theme: 'github-light',
        })
        if (!cancelled) {
          setState({ kind: 'rendered', lines: normalizeTokenLines(result) })
        }
      } catch {
        if (!cancelled) {
          setState({ kind: 'fallback' })
        }
      } finally {
        registry?.markSettled(key)
      }
    })()

    return () => {
      cancelled = true
      registry?.markSettled(key)
    }
  }, [code, lang, blockKey, registry])

  if (state.kind === 'rendered') {
    return (
      <pre className="overflow-x-auto rounded-md bg-white p-3 text-sm leading-relaxed text-neutral-900 ring-1 ring-neutral-200">
        <code className={lang ? `language-${lang}` : undefined}>
          {state.lines.map((line, lineIndex) => (
            <span key={lineIndex} style={{ display: 'block' }}>
              {line.length === 0 ? '\n' : line.map((token, tokenIndex) => (
                <span key={tokenIndex} style={tokenStyle(token)}>{token.content}</span>
              ))}
            </span>
          ))}
        </code>
      </pre>
    )
  }

  return (
    <pre
      data-shiki-fallback={state.kind === 'fallback' ? 'true' : undefined}
      className="overflow-x-auto rounded-md bg-neutral-50 p-3 text-sm leading-relaxed text-neutral-900 ring-1 ring-neutral-200"
    >
      <code className={lang ? `language-${lang}` : undefined}>{code}</code>
    </pre>
  )
}
