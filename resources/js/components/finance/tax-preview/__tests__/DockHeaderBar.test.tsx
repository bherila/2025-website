import { fireEvent, render, screen } from '@testing-library/react'

import { DockHeaderBar } from '../DockHeaderBar'

const mockSetPaletteOpen = jest.fn()
const mockExportXlsx = jest.fn()
let mockIsExportingXlsx = false

jest.mock('../DockActions', () => ({
  useDockActions: () => ({
    exportXlsx: mockExportXlsx,
    isExportingXlsx: mockIsExportingXlsx,
    setPaletteOpen: mockSetPaletteOpen,
  }),
}))

describe('DockHeaderBar', () => {
  beforeEach(() => {
    mockSetPaletteOpen.mockClear()
    mockExportXlsx.mockClear()
    mockIsExportingXlsx = false
  })

  it('shows the XLSX export action in dock mode chrome', () => {
    render(<DockHeaderBar />)

    const exportButton = screen.getByRole('button', { name: /export xlsx/i })
    expect(exportButton).toBeInTheDocument()
    fireEvent.click(exportButton)
    expect(mockExportXlsx).toHaveBeenCalledTimes(1)
  })

  it('disables the XLSX export action while generating', () => {
    mockIsExportingXlsx = true

    render(<DockHeaderBar />)

    expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled()
  })
})
