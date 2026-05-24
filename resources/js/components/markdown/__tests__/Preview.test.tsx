import { render, screen } from '@testing-library/react'

import { Preview } from '../Preview'
import { createPreviewRenderRegistry } from '../previewRenderRegistry'

// Local Node-API declarations so this test does not depend on @types/node
// being in the project's `types` list.
declare const __dirname: string
declare const require: (id: string) => unknown
const { readFileSync } = require('node:fs') as { readFileSync: (p: string, enc: string) => string }
const { resolve } = require('node:path') as { resolve: (...parts: string[]) => string }

interface MockReactMarkdownProps {
  children: React.ReactNode
  components?: Record<string, React.ElementType>
  remarkPlugins?: unknown[]
  skipHtml?: boolean | undefined
}

const mockReactMarkdownCalls: MockReactMarkdownProps[] = []

jest.mock('react-markdown', () => ({
  __esModule: true,
  default({ children, components = {}, remarkPlugins = [], skipHtml }: MockReactMarkdownProps): React.JSX.Element {
    mockReactMarkdownCalls.push({ children, components, remarkPlugins, skipHtml })

    if (remarkPlugins.length > 0 && typeof children === 'string' && children.includes('| Feature |')) {
      const Table = (components.table ?? 'table') as React.ElementType
      const Thead = (components.thead ?? 'thead') as React.ElementType
      const Tbody = (components.tbody ?? 'tbody') as React.ElementType
      const Tr = (components.tr ?? 'tr') as React.ElementType
      const Th = (components.th ?? 'th') as React.ElementType
      const Td = (components.td ?? 'td') as React.ElementType

      return (
        <Table>
          <Thead>
            <Tr>
              <Th>Feature</Th>
              <Th style={{ textAlign: 'right' }}>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            <Tr>
              <Td>Tables</Td>
              <Td style={{ textAlign: 'right' }}>Working</Td>
            </Tr>
          </Tbody>
        </Table>
      )
    }

    if (typeof children === 'string' && children.includes('```mermaid')) {
      const Pre = (components.pre ?? 'pre') as React.ElementType
      const Code = (components.code ?? 'code') as React.ElementType

      return (
        <Pre>
          <Code className="language-mermaid">
            {'flowchart TD\n  A --> B\n'}
          </Code>
        </Pre>
      )
    }

    if (typeof children === 'string' && children.includes('```ts')) {
      const Pre = (components.pre ?? 'pre') as React.ElementType
      const Code = (components.code ?? 'code') as React.ElementType

      return (
        <Pre>
          <Code className="language-ts">{'const value = 1\n'}</Code>
        </Pre>
      )
    }

    if (typeof children === 'string' && children.includes('```\nplain')) {
      const Pre = (components.pre ?? 'pre') as React.ElementType
      const Code = (components.code ?? 'code') as React.ElementType

      return (
        <Pre>
          <Code>{'plain text\n'}</Code>
        </Pre>
      )
    }

    if (typeof children === 'string' && children.includes('`inline`')) {
      const Code = (components.code ?? 'code') as React.ElementType

      return (
        <p>
          Before <Code>inline</Code> after
        </p>
      )
    }

    return <>{children}</>
  },
}))

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: function remarkGfm(): void {},
}))

jest.mock('../MermaidBlock', () => ({
  MermaidBlock({ code }: { code: string }): React.JSX.Element {
    return <div data-testid="mermaid-block">{code}</div>
  },
}))

jest.mock('../ShikiBlock', () => ({
  ShikiBlock({ code, lang }: { code: string; lang: string }): React.JSX.Element {
    return <pre data-testid="shiki-block" data-language={lang}>{code}</pre>
  },
}))

function renderPreview(markdown: string): ReturnType<typeof render> {
  return render(<Preview markdown={markdown} registry={createPreviewRenderRegistry()} />)
}

describe('Preview', () => {
  beforeEach(() => {
    mockReactMarkdownCalls.length = 0
  })

  it('renders GitHub-flavored Markdown tables', () => {
    const { container } = renderPreview(`
| Feature | Status |
| --- | ---: |
| Tables | Working |
`)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Feature' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Status' })).toHaveClass('text-right')
    expect(screen.getByRole('cell', { name: 'Tables' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Working' })).toHaveClass('text-right')
    expect(container.querySelector('.overflow-x-auto table')).not.toBeNull()
    expect(mockReactMarkdownCalls[0]?.skipHtml).toBe(true)
    expect(mockReactMarkdownCalls[0]?.remarkPlugins).toHaveLength(1)
  })

  it('keeps mermaid code fences routed to MermaidBlock', () => {
    renderPreview(`
\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`
`)

    expect(screen.getByTestId('mermaid-block')).toHaveTextContent('flowchart TD')
  })

  it('renders backtick fenced code blocks through ShikiBlock', () => {
    const { container } = renderPreview(`
\`\`\`ts
const value = 1
\`\`\`
`)

    expect(screen.getByTestId('shiki-block')).toHaveAttribute('data-language', 'ts')
    expect(screen.getByTestId('shiki-block')).toHaveTextContent('const value = 1')
    expect(container.querySelector('pre pre')).toBeNull()
  })

  it('renders unlabelled backtick fenced code blocks through ShikiBlock', () => {
    renderPreview(`
\`\`\`
plain text
\`\`\`
`)

    expect(screen.getByTestId('shiki-block')).toHaveAttribute('data-language', '')
    expect(screen.getByTestId('shiki-block')).toHaveTextContent('plain text')
  })

  it('keeps inline backtick code inline', () => {
    const { container } = renderPreview('Before `inline` after')

    expect(screen.getByText('inline')).toHaveClass('text-foreground')
    expect(screen.queryByTestId('shiki-block')).not.toBeInTheDocument()
    expect(container.querySelector('p > code')).not.toBeNull()
  })

  // The Preview wraps content in `prose`, which is `@tailwindcss/typography`.
  // Its default theme adds literal backticks around inline <code> via
  // `code::before { content: '`' }` / `code::after { content: '`' }`. We
  // override that in resources/css/app.css so inline code in the markdown
  // preview is not visually wrapped in backticks. This test fails if that
  // override is removed.
  it('disables the prose backtick pseudo-elements on markdown-preview code', () => {
    const cssPath = resolve(__dirname, '../../../../css/app.css')
    const css = readFileSync(cssPath, 'utf8')
    const overridePattern = /\.markdown-preview\s+code::before\s*,\s*\.markdown-preview\s+code::after\s*\{\s*content:\s*none\s*;?\s*\}/

    expect(css).toMatch(overridePattern)
  })
})
