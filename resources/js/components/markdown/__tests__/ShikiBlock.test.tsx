import { act, render, screen, waitFor } from '@testing-library/react'

import { PreviewRenderRegistryContext } from '../PreviewContext'
import { createPreviewRenderRegistry } from '../previewRenderRegistry'
import { ShikiBlock } from '../ShikiBlock'

jest.mock('../shikiLoader', () => ({
  loadShiki: jest.fn(),
  resetShikiForTests: jest.fn(),
}))

const shikiLoader = jest.requireMock('../shikiLoader') as {
  loadShiki: jest.Mock
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
    shikiLoader.loadShiki.mockReset()
  })

  it('renders highlighted tokens when shiki resolves', async () => {
    shikiLoader.loadShiki.mockResolvedValue({
      bundledLanguages: { js: {} },
      codeToTokens: async () => ({
        tokens: [
          [
            { content: 'const', color: '#abcdef' },
            { content: ' x', color: '#123456' },
          ],
        ],
      }),
    })

    const { registry } = renderWithRegistry(<ShikiBlock code="const x" lang="js" />)
    await act(async () => {
      await registry.waitUntilSettled()
    })

    expect(screen.getByText('const')).toBeInTheDocument()
  })

  it('falls back to plain code and settles the registry when the loader rejects', async () => {
    shikiLoader.loadShiki.mockRejectedValue(new Error('CDN unavailable'))

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
