import { act, render, screen, waitFor } from '@testing-library/react'

import { PreviewRenderRegistryContext } from '../PreviewContext'
import { createPreviewRenderRegistry } from '../previewRenderRegistry'
import { ShikiBlock } from '../ShikiBlock'

jest.mock('shiki', () => ({
  bundledLanguages: { js: {} },
  codeToTokens: jest.fn(),
}))

const shiki = jest.requireMock('shiki') as {
  codeToTokens: jest.Mock
}

function renderWithRegistry(ui: React.ReactNode) {
  const registry = createPreviewRenderRegistry()
  registry.resetForRevision('rev')
  return {
    registry,
    ...render(
      <PreviewRenderRegistryContext.Provider value={registry}>{ui}</PreviewRenderRegistryContext.Provider>,
    ),
  }
}

describe('ShikiBlock', () => {
  beforeEach(() => {
    shiki.codeToTokens.mockReset()
  })

  it('renders highlighted tokens when shiki resolves', async () => {
    shiki.codeToTokens.mockResolvedValue({
      tokens: [
        [
          { content: 'const', color: '#abcdef' },
          { content: ' x', color: '#123456' },
        ],
      ],
    })

    const { registry } = renderWithRegistry(<ShikiBlock code="const x" lang="js" />)
    await act(async () => {
      await registry.waitUntilSettled()
    })

    expect(screen.getByText('const')).toBeInTheDocument()
  })

  it('falls back to plain code and settles the registry when highlighting fails', async () => {
    shiki.codeToTokens.mockRejectedValue(new Error('highlight unavailable'))

    const { registry, container } = renderWithRegistry(<ShikiBlock code="plain code" lang="js" />)

    await act(async () => {
      await registry.waitUntilSettled()
    })

    await waitFor(() => {
      const fallback = container.querySelector('pre[data-shiki-fallback="true"]')
      expect(fallback).not.toBeNull()
    })
    expect(screen.getByText('plain code')).toBeInTheDocument()
  })
})
