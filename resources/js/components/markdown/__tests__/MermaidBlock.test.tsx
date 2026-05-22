import { act, render, screen, waitFor } from '@testing-library/react'

import { MermaidBlock } from '../MermaidBlock'
import { PreviewRenderRegistryContext } from '../PreviewContext'
import { createPreviewRenderRegistry } from '../previewRenderRegistry'

jest.mock('mermaid', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    render: jest.fn(),
  },
}))

const mermaid = jest.requireMock('mermaid') as {
  default: {
    initialize: jest.Mock
    render: jest.Mock
  }
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
    mermaid.default.initialize.mockReset()
    mermaid.default.render.mockReset()
  })

  it('renders sanitized SVG when mermaid succeeds', async () => {
    mermaid.default.render.mockResolvedValue({ svg: '<svg><script>alert(1)</script><g></g></svg>' })

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
    mermaid.default.render.mockRejectedValue(new Error('bad diagram'))

    const { registry, container } = renderWithRegistry(<MermaidBlock code="not valid" />)
    await act(async () => {
      await registry.waitUntilSettled()
    })

    await waitFor(() => {
      expect(container.querySelector('[data-mermaid-error="true"]')).not.toBeNull()
    })
    expect(screen.getByText('Mermaid diagram error')).toBeInTheDocument()
  })
})
