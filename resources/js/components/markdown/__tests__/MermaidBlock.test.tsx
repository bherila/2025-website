import { act, render, screen, waitFor } from '@testing-library/react'

import { MermaidBlock } from '../MermaidBlock'
import { PreviewRenderRegistryContext } from '../PreviewContext'
import { createPreviewRenderRegistry } from '../previewRenderRegistry'

jest.mock('../mermaidLoader', () => ({
  loadMermaid: jest.fn(),
  resetMermaidForTests: jest.fn(),
}))

const mermaidLoader = jest.requireMock('../mermaidLoader') as {
  loadMermaid: jest.Mock
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

describe('MermaidBlock', () => {
  beforeEach(() => {
    mermaidLoader.loadMermaid.mockReset()
  })

  it('renders sanitized SVG when mermaid succeeds', async () => {
    mermaidLoader.loadMermaid.mockResolvedValue({
      initialize: jest.fn(),
      render: jest.fn().mockResolvedValue({ svg: '<svg><script>alert(1)</script><g></g></svg>' }),
    })

    const { registry, container } = renderWithRegistry(<MermaidBlock code="graph TD; A-->B" />)
    await act(async () => {
      await registry.waitUntilSettled()
    })

    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull()
    })
    expect(container.querySelector('svg script')).toBeNull()
  })

  it('renders an error placeholder and settles the registry on render failure', async () => {
    mermaidLoader.loadMermaid.mockResolvedValue({
      initialize: jest.fn(),
      render: jest.fn().mockRejectedValue(new Error('bad diagram')),
    })

    const { registry, container } = renderWithRegistry(<MermaidBlock code="not valid" />)
    await act(async () => {
      await registry.waitUntilSettled()
    })

    await waitFor(() => {
      expect(container.querySelector('[data-mermaid-error="true"]')).not.toBeNull()
    })
    expect(screen.getByText('Mermaid diagram error')).toBeInTheDocument()
  })

  it('settles the registry even when the loader itself rejects', async () => {
    mermaidLoader.loadMermaid.mockRejectedValue(new Error('CDN unavailable'))

    const { registry } = renderWithRegistry(<MermaidBlock code="graph TD; A-->B" />)

    await expect(registry.waitUntilSettled()).resolves.toBeUndefined()
  })
})
