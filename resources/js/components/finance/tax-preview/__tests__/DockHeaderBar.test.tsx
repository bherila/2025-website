import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'

import { DockHeaderBar } from '../DockHeaderBar'

const mockSetPaletteOpen = jest.fn()
const mockExportXlsx = jest.fn()
const mockOpenReviewQueue = jest.fn()
let mockIsExportingXlsx = false

jest.mock('../DockActions', () => ({
  useDockActions: () => ({
    exportXlsx: mockExportXlsx,
    isExportingXlsx: mockIsExportingXlsx,
    openReviewQueue: mockOpenReviewQueue,
    setPaletteOpen: mockSetPaletteOpen,
  }),
}))

function renderHeader(overrides: Partial<ComponentProps<typeof DockHeaderBar>> = {}) {
  const props = {
    selectedYear: 2025,
    availableYears: [2025, 2024],
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
    mockSetPaletteOpen.mockClear()
    mockExportXlsx.mockClear()
    mockOpenReviewQueue.mockClear()
    mockIsExportingXlsx = false
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
})
