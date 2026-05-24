import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'

import { MarkdownRendererPage } from '../MarkdownRendererPage'
import type { MarkdownInitialData } from '../types'

const mockPreviewSettlers: Array<() => void> = []

jest.mock('../Preview', () => {
  const React = jest.requireActual('react') as typeof import('react')

  return {
    Preview({
      markdown,
      registry,
      ref,
    }: {
      markdown: string
      registry: {
        registerPending(key: string): void
        markSettled(key: string): void
      }
      ref?: React.Ref<HTMLDivElement>
    }) {
      React.useLayoutEffect(() => {
        const key = `mock-preview:${markdown}`
        registry.registerPending(key)
        const settle = (): void => registry.markSettled(key)
        mockPreviewSettlers.push(settle)

        return settle
      }, [markdown, registry])

      return <div ref={ref} data-testid="preview">{markdown}</div>
    },
  }
})

jest.mock('../markdownApi', () => ({
  saveMarkdownDocument: jest.fn(),
  updateMarkdownDocument: jest.fn(),
}))

jest.mock('../printExport', () => ({
  prepareAndPrint: jest.fn(),
}))

const markdownApi = jest.requireMock('../markdownApi') as {
  saveMarkdownDocument: jest.Mock
  updateMarkdownDocument: jest.Mock
}

const printExport = jest.requireMock('../printExport') as {
  prepareAndPrint: jest.Mock
}

function makeInitialData(overrides: Partial<MarkdownInitialData> = {}): MarkdownInitialData {
  return {
    document: null,
    markdown: '# Draft',
    title: null,
    canEdit: false,
    authenticated: true,
    ...overrides,
  }
}

function makeDocument(): NonNullable<MarkdownInitialData['document']> {
  return {
    id: 12,
    shortCode: 'abc123',
    title: null,
    shareUrl: 'https://example.test/tools/markdown/s/abc123',
    ownerUserId: 1,
  }
}

describe('MarkdownRendererPage', () => {
  beforeEach(() => {
    mockPreviewSettlers.length = 0
    markdownApi.saveMarkdownDocument.mockReset()
    markdownApi.updateMarkdownDocument.mockReset()
    printExport.prepareAndPrint.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('uses tabbed markdown and preview panes, defaulting new documents to markdown', () => {
    render(<MarkdownRendererPage initialData={makeInitialData()} />)

    expect(screen.getByRole('tab', { name: 'Markdown' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('textbox', { name: 'Markdown' })).toBeInTheDocument()
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument()
  })

  it('defaults existing documents to the preview tab', () => {
    render(<MarkdownRendererPage initialData={makeInitialData({ document: makeDocument(), canEdit: true })} />)

    expect(screen.getByRole('tab', { name: 'Markdown' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('preview')).toHaveTextContent('# Draft')
    expect(screen.queryByRole('textbox', { name: 'Markdown' })).not.toBeInTheDocument()
  })

  it('allows a newly saved document to be updated without reloading', async () => {
    markdownApi.saveMarkdownDocument.mockResolvedValue({
      id: 12,
      shortCode: 'abc123',
      title: null,
      shareUrl: 'https://example.test/tools/markdown/s/abc123',
    })
    markdownApi.updateMarkdownDocument.mockResolvedValue({
      id: 12,
      shortCode: 'abc123',
      title: null,
      shareUrl: 'https://example.test/tools/markdown/s/abc123',
    })

    render(<MarkdownRendererPage initialData={makeInitialData()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save & Share' }))

    expect(await screen.findByRole('button', { name: 'Update' })).toBeInTheDocument()
    expect(screen.queryByText('Viewing shared document')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown' }), {
      target: { value: '# Edited' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => {
      expect(markdownApi.updateMarkdownDocument).toHaveBeenCalledWith('abc123', null, '# Edited')
    })
  })

  it('keeps print preparation pending until the current preview revision settles', async () => {
    jest.useFakeTimers()
    printExport.prepareAndPrint.mockImplementation(async (registry) => {
      await registry.waitUntilSettled()
    })

    render(<MarkdownRendererPage initialData={makeInitialData({ document: makeDocument(), canEdit: true })} />)

    await waitFor(() => {
      expect(mockPreviewSettlers).toHaveLength(1)
    })
    act(() => {
      mockPreviewSettlers[0]?.()
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Markdown' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown' }), {
      target: { value: '# Updated preview' },
    })
    act(() => {
      jest.advanceTimersByTime(150)
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))

    expect(screen.getByTestId('preview')).toHaveTextContent('# Updated preview')
    await waitFor(() => {
      expect(mockPreviewSettlers).toHaveLength(2)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }))

    expect(await screen.findByRole('button', { name: 'Preparing…' })).toBeDisabled()

    await act(async () => {
      mockPreviewSettlers[1]?.()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Print / Save as PDF' })).toBeEnabled()
    })
  })
})
