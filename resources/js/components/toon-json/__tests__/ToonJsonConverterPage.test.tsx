import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'

import { ToonJsonConverterPage } from '../ToonJsonConverterPage'
import type { ToonInitialData } from '../types'

jest.mock('../toonApi', () => ({
  saveToonDocument: jest.fn(),
  updateToonDocument: jest.fn(),
}))

const toonApi = jest.requireMock('../toonApi') as {
  saveToonDocument: jest.Mock
  updateToonDocument: jest.Mock
}

function makeInitialData(overrides: Partial<ToonInitialData> = {}): ToonInitialData {
  return {
    document: {
      id: 861,
      shortCode: 'toon861',
      title: null,
      shareUrl: 'https://example.test/tools/toon-json/s/toon861',
      ownerUserId: 1,
    },
    toon: '{"saved":true}',
    title: null,
    canEdit: true,
    authenticated: true,
    ...overrides,
  }
}

describe('ToonJsonConverterPage', () => {
  beforeEach(() => {
    toonApi.saveToonDocument.mockReset()
    toonApi.updateToonDocument.mockReset()
    toonApi.updateToonDocument.mockResolvedValue({
      id: 861,
      shortCode: 'toon861',
      title: null,
      shareUrl: 'https://example.test/tools/toon-json/s/toon861',
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('updates from the last-edited JSON pane without waiting for debounce', async () => {
    jest.useFakeTimers()
    render(<ToonJsonConverterPage initialData={makeInitialData()} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'JSON' }), {
      target: { value: '{"fresh":true}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => {
      expect(toonApi.updateToonDocument).toHaveBeenCalledWith('toon861', null, '{\n  "fresh": true\n}')
    })
  })

  it('does not update invalid JSON before the debounce has run', () => {
    jest.useFakeTimers()
    render(<ToonJsonConverterPage initialData={makeInitialData()} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'JSON' }), {
      target: { value: '{ bad json }' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    expect(toonApi.updateToonDocument).not.toHaveBeenCalled()
    expect(screen.getByText(/Expected|Unexpected/)).toBeInTheDocument()
  })

  it('clears stale TOON errors when JSON conversion succeeds', async () => {
    jest.useFakeTimers()
    render(<ToonJsonConverterPage initialData={makeInitialData()} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'TOON' }), {
      target: { value: '{ bad toon }' },
    })
    act(() => {
      jest.advanceTimersByTime(200)
    })

    await waitFor(() => {
      expect(screen.getByText(/Expected|Unexpected/)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('textbox', { name: 'JSON' }), {
      target: { value: '{"recovered":true}' },
    })
    act(() => {
      jest.advanceTimersByTime(200)
    })

    await waitFor(() => {
      expect(screen.queryByText(/Expected|Unexpected/)).not.toBeInTheDocument()
    })
  })
})
