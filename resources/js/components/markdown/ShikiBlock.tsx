import { useContext, useEffect, useId, useState } from 'react'
import { type BundledLanguage, bundledLanguages, codeToTokens } from 'shiki'

import { PreviewRenderRegistryContext } from './PreviewContext'

interface ShikiTokenStyle {
  htmlStyle?: Record<string, string>
}

interface ShikiTokenLine {
  tokens: ShikiTokenStyle[]
}

interface ShikiToken extends ShikiTokenStyle {
  content: string
}

function normalizeTokenLines(input: { tokens: ShikiToken[][] } | { tokens: ShikiTokenLine[] }): ShikiToken[][] {
  const lines = input.tokens
  if (lines.length === 0) {
    return []
  }
  const first = lines[0] as ShikiToken[] | ShikiTokenLine
  if (Array.isArray(first)) {
    return lines as ShikiToken[][]
  }
  return (lines as ShikiTokenLine[]).map((line) => line.tokens as ShikiToken[])
}

function htmlStyleToReact(htmlStyle: Record<string, string> | undefined): React.CSSProperties {
  if (!htmlStyle) {
    return {}
  }
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(htmlStyle)) {
    if (key.startsWith('--')) {
      result[key] = value
    } else {
      const camel = key.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase())
      result[camel] = value
    }
  }
  return result as React.CSSProperties
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
        const supported = lang !== '' && lang in bundledLanguages
        const result = await codeToTokens(code, {
          lang: (supported ? lang : 'text') as BundledLanguage,
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        })
        if (!cancelled) {
          setState({ kind: 'rendered', lines: normalizeTokenLines(result) as ShikiToken[][] })
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
      <pre className="shiki-pre overflow-x-auto rounded-md bg-card p-3 text-sm leading-relaxed ring-1 ring-border">
        <code className={lang ? `language-${lang}` : undefined}>
          {state.lines.map((line, lineIndex) => (
            <span key={lineIndex} style={{ display: 'block' }}>
              {line.length === 0 ? '\n' : line.map((token, tokenIndex) => (
                <span key={tokenIndex} className="shiki-token" style={htmlStyleToReact(token.htmlStyle)}>{token.content}</span>
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
      className="shiki-pre overflow-x-auto rounded-md bg-muted p-3 text-sm leading-relaxed text-foreground ring-1 ring-border"
    >
      <code className={lang ? `language-${lang}` : undefined}>{code}</code>
    </pre>
  )
}
