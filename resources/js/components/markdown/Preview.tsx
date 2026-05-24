import { forwardRef } from 'react'
import ReactMarkdown, { type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { MermaidBlock } from './MermaidBlock'
import { PreviewRenderRegistryContext } from './PreviewContext'
import type { PreviewRenderRegistry } from './previewRenderRegistry'
import { ShikiBlock } from './ShikiBlock'

interface PreviewProps {
  markdown: string
  registry: PreviewRenderRegistry
}

type CodeProps = React.ComponentPropsWithoutRef<'code'> & ExtraProps
type PreProps = React.ComponentPropsWithoutRef<'pre'> & ExtraProps
type TableProps = React.ComponentPropsWithoutRef<'table'> & ExtraProps
type TableSectionProps = React.ComponentPropsWithoutRef<'thead'> & ExtraProps
type TableBodyProps = React.ComponentPropsWithoutRef<'tbody'> & ExtraProps
type TableRowProps = React.ComponentPropsWithoutRef<'tr'> & ExtraProps
type TableHeaderProps = React.ComponentPropsWithoutRef<'th'> & ExtraProps
type TableCellProps = React.ComponentPropsWithoutRef<'td'> & ExtraProps

function classNames(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

function tableAlignClass(align: string | undefined, style: React.CSSProperties | undefined): string {
  const textAlign = align ?? (typeof style?.textAlign === 'string' ? style.textAlign : undefined)

  if (textAlign === 'center') {
    return 'text-center'
  }
  if (textAlign === 'right') {
    return 'text-right'
  }
  return 'text-left'
}

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

function CodeRenderer({ className, children }: CodeProps): React.JSX.Element {
  const rawText = nodeToString(children)
  const text = rawText.replace(/\n$/, '')
  const lang = extractLang(className)
  const isInline = !lang && !rawText.endsWith('\n')

  if (isInline) {
    return (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground">
        {children}
      </code>
    )
  }

  if (lang === 'mermaid') {
    return <MermaidBlock code={text} />
  }

  return <ShikiBlock code={text} lang={lang} />
}

function PreRenderer({ children }: PreProps): React.JSX.Element {
  return <>{children}</>
}

function TableRenderer({ children, className, node: _node, ...props }: TableProps): React.JSX.Element {
  return (
    <div className="my-6 overflow-x-auto rounded-md border border-border">
      <table
        {...props}
        className={classNames('my-0 w-full min-w-max border-collapse text-sm', className)}
      >
        {children}
      </table>
    </div>
  )
}

function TableHeadRenderer({ children, className, node: _node, ...props }: TableSectionProps): React.JSX.Element {
  return (
    <thead {...props} className={classNames('bg-muted/60', className)}>
      {children}
    </thead>
  )
}

function TableBodyRenderer({ children, className, node: _node, ...props }: TableBodyProps): React.JSX.Element {
  return (
    <tbody {...props} className={className}>
      {children}
    </tbody>
  )
}

function TableRowRenderer({ children, className, node: _node, ...props }: TableRowProps): React.JSX.Element {
  return (
    <tr {...props} className={classNames('border-border', className)}>
      {children}
    </tr>
  )
}

function TableHeaderRenderer({ children, className, node: _node, ...props }: TableHeaderProps): React.JSX.Element {
  return (
    <th
      {...props}
      className={classNames(
        'border-b border-border px-3 py-2 align-bottom font-semibold text-foreground',
        tableAlignClass(props.align, props.style),
        className,
      )}
    >
      {children}
    </th>
  )
}

function TableCellRenderer({ children, className, node: _node, ...props }: TableCellProps): React.JSX.Element {
  return (
    <td
      {...props}
      className={classNames(
        'border-t border-border px-3 py-2 align-top text-foreground',
        tableAlignClass(props.align, props.style),
        className,
      )}
    >
      {children}
    </td>
  )
}

export const Preview = forwardRef<HTMLDivElement, PreviewProps>(function Preview(
  { markdown, registry },
  ref,
): React.JSX.Element {
  return (
    <PreviewRenderRegistryContext.Provider value={registry}>
      <div
        ref={ref}
        className="markdown-preview prose prose-neutral max-w-none rounded-md bg-card p-6 ring-1 ring-border dark:prose-invert"
      >
        <ReactMarkdown
          skipHtml
          remarkPlugins={[remarkGfm]}
          components={{
            code: CodeRenderer,
            pre: PreRenderer,
            table: TableRenderer,
            tbody: TableBodyRenderer,
            td: TableCellRenderer,
            th: TableHeaderRenderer,
            thead: TableHeadRenderer,
            tr: TableRowRenderer,
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </PreviewRenderRegistryContext.Provider>
  )
})
