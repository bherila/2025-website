import { forwardRef } from 'react'
import ReactMarkdown, { type ExtraProps } from 'react-markdown'

import { MermaidBlock } from './MermaidBlock'
import { PreviewRenderRegistryContext } from './PreviewContext'
import type { PreviewRenderRegistry } from './previewRenderRegistry'
import { ShikiBlock } from './ShikiBlock'

interface PreviewProps {
  markdown: string
  registry: PreviewRenderRegistry
}

type CodeProps = React.ComponentPropsWithoutRef<'code'> & ExtraProps

function extractLang(className: string | undefined): string {
  if (!className) {
    return ''
  }
  const match = /language-([\w-]+)/.exec(className)
  return match?.[1] ?? ''
}

function nodeToString(children: React.ReactNode): string {
  if (typeof children === 'string') {
    return children
  }
  if (Array.isArray(children)) {
    return children.map(nodeToString).join('')
  }
  return ''
}

function CodeRenderer({ className, children, node }: CodeProps): React.JSX.Element {
  const text = nodeToString(children).replace(/\n$/, '')
  const lang = extractLang(className)
  const isInline = !lang && !text.includes('\n') && node?.position?.start?.line === node?.position?.end?.line

  if (isInline) {
    return (
      <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.9em] text-neutral-800">
        {children}
      </code>
    )
  }

  if (lang === 'mermaid') {
    return <MermaidBlock code={text} />
  }

  return <ShikiBlock code={text} lang={lang} />
}

export const Preview = forwardRef<HTMLDivElement, PreviewProps>(function Preview(
  { markdown, registry },
  ref,
): React.JSX.Element {
  return (
    <PreviewRenderRegistryContext.Provider value={registry}>
      <div
        ref={ref}
        className="markdown-preview prose prose-neutral max-w-none rounded-md bg-white p-6 ring-1 ring-neutral-200"
      >
        <ReactMarkdown
          skipHtml
          components={{
            code: CodeRenderer,
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </PreviewRenderRegistryContext.Provider>
  )
})
