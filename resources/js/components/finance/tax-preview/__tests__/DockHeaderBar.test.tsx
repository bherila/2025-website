import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'

import { DockHeaderBar } from '../DockHeaderBar'

const mockSetFinanceCommandPaletteOpen = jest.fn()
const mockExportXlsx = jest.fn()
const mockOpenTaxReturnPdfExport = jest.fn()
const mockOpenReviewQueue = jest.fn()
let mockIsExportingXlsx = false
let mockIsExportingPdf = false

jest.mock('../../FinanceCommandRegistry', () => ({
  setFinanceCommandPaletteOpen: (open: boolean) => mockSetFinanceCommandPaletteOpen(open),
}))

jest.mock('../DockActions', () => ({
  useDockActions: () => ({
    exportXlsx: mockExportXlsx,
    isExportingXlsx: mockIsExportingXlsx,
    openTaxReturnPdfExport: mockOpenTaxReturnPdfExport,
    isExportingPdf: mockIsExportingPdf,
    openReviewQueue: mockOpenReviewQueue,
  }),
}))

function renderHeader(overrides: Partial<ComponentProps<typeof DockHeaderBar>> = {}) {
  const props = {
    selectedYear: 2025,
    availableYears: [2025, 2024],
    isExportXlsxDisabled: false,
    isExportPdfDisabled: false,
    isLoadingYears: false,
    pendingReviewCount: 0,
    onYearChange: jest.fn(),
    ...overrides,
  }

  return {
    ...render(<DockHeaderBar {...props} />),
    props,
  }
}

describe('DockHeaderBar', () => {
  beforeEach(() => {
    mockSetFinanceCommandPaletteOpen.mockClear()
    mockExportXlsx.mockClear()
    mockOpenTaxReturnPdfExport.mockClear()
    mockOpenReviewQueue.mockClear()
    mockIsExportingXlsx = false
    mockIsExportingPdf = false
  })

  it('opens the IRS PDF export action from the tax preview chrome', () => {
    renderHeader()

    const exportButton = screen.getByRole('button', { name: /irs pdf/i })
    expect(exportButton).toBeInTheDocument()
    fireEvent.click(exportButton)
    expect(mockOpenTaxReturnPdfExport).toHaveBeenCalledTimes(1)
  })

  it('disables the IRS PDF export action while generating', () => {
    mockIsExportingPdf = true

    renderHeader()

    expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled()
  })

  it('shows the XLSX export action in the tax preview chrome', () => {
    renderHeader()

    const exportButton = screen.getByRole('button', { name: /export xlsx/i })
    expect(exportButton).toBeInTheDocument()
    fireEvent.click(exportButton)
    expect(mockExportXlsx).toHaveBeenCalledTimes(1)
    expect(mockExportXlsx).toHaveBeenCalledWith()
  })

  it('disables the XLSX export action while generating', () => {
    mockIsExportingXlsx = true

    renderHeader()

    expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled()
  })

  it('disables the XLSX export action while dock data loads', () => {
    renderHeader({ isExportXlsxDisabled: true })

    const exportButton = screen.getByRole('button', { name: /export xlsx/i })
    expect(exportButton).toBeDisabled()
    fireEvent.click(exportButton)
    expect(mockExportXlsx).not.toHaveBeenCalled()
  })

  it('shows the selected year control', () => {
    renderHeader()

    expect(screen.getByRole('combobox')).toHaveTextContent('2025')
  })

  it('opens the document review queue when pending documents exist', () => {
    renderHeader({ pendingReviewCount: 3 })

    const reviewButton = screen.getByRole('button', { name: /review documents/i })
    expect(reviewButton).toHaveTextContent('3')
    fireEvent.click(reviewButton)
    expect(mockOpenReviewQueue).toHaveBeenCalledTimes(1)
  })

  it('does not show a dock disable hint', () => {
    renderHeader()

    expect(screen.queryByText(/dock=0/i)).not.toBeInTheDocument()
  })

  it('opens the shared Finance command palette from the jump button', () => {
    renderHeader()

    fireEvent.click(screen.getByRole('button', { name: /open command palette/i }))

    expect(mockSetFinanceCommandPaletteOpen).toHaveBeenCalledWith(true)
  })
})
