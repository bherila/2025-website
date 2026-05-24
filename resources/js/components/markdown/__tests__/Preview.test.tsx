import { render, screen } from '@testing-library/react'

import { Preview } from '../Preview'
import { createPreviewRenderRegistry } from '../previewRenderRegistry'

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
              <Th align="right">Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            <Tr>
              <Td>Tables</Td>
              <Td align="right">Working</Td>
            </Tr>
          </Tbody>
        </Table>
      )
    }

    if (typeof children === 'string' && children.includes('```mermaid')) {
      const Code = (components.code ?? 'code') as React.ElementType

      return (
        <Code
          className="language-mermaid"
          node={{
            position: {
              end: { line: 4 },
              start: { line: 2 },
            },
          }}
        >
          {'flowchart TD\n  A --> B\n'}
        </Code>
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
    return <pre data-language={lang}>{code}</pre>
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
})
