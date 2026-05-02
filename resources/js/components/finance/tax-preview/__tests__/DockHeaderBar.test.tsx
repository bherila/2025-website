import { fireEvent, render, screen } from '@testing-library/react'

import { DockHeaderBar } from '../DockHeaderBar'

const mockSetPaletteOpen = jest.fn()

jest.mock('../DockActions', () => ({
  useDockActions: () => ({ setPaletteOpen: mockSetPaletteOpen }),
}))

describe('DockHeaderBar', () => {
  beforeEach(() => {
    mockSetPaletteOpen.mockClear()
  })

  it('shows the XLSX export action in dock mode chrome', () => {
    const onExportXlsx = jest.fn()

    render(<DockHeaderBar onExportXlsx={onExportXlsx} isExporting={false} />)

    const exportButton = screen.getByRole('button', { name: /export xlsx/i })
    expect(exportButton).toBeInTheDocument()
    fireEvent.click(exportButton)
    expect(onExportXlsx).toHaveBeenCalledTimes(1)
  })

  it('disables the XLSX export action while generating', () => {
    render(<DockHeaderBar onExportXlsx={jest.fn()} isExporting />)

    expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled()
  })
})
