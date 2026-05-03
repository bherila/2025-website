import { fireEvent, render, screen } from '@testing-library/react'

import type { YearSelection } from '@/lib/financeRouteBuilder'

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

jest.mock('@/components/finance/YearSelectorWithNav', () => ({
  YearSelectorWithNav: ({ onYearChange }: { onYearChange: (year: YearSelection) => void }) => (
    <div>
      <button type="button" onClick={() => onYearChange(2024)}>
        Change year
      </button>
      <button type="button" onClick={() => onYearChange('all')}>
        Select all
      </button>
    </div>
  ),
}))

describe('DockHeaderBar', () => {
  const baseProps = {
    year: 2025,
    availableYears: [2025, 2024],
    isLoading: false,
    onYearChange: jest.fn(),
    pendingReviewCount: 0,
  }

  beforeEach(() => {
    mockSetPaletteOpen.mockClear()
    mockExportXlsx.mockClear()
    mockOpenReviewQueue.mockClear()
    mockIsExportingXlsx = false
  })

  it('shows the XLSX export action in dock mode chrome', () => {
    render(<DockHeaderBar {...baseProps} />)

    const exportButton = screen.getByRole('button', { name: /export xlsx/i })
    expect(exportButton).toBeInTheDocument()
    fireEvent.click(exportButton)
    expect(mockExportXlsx).toHaveBeenCalledTimes(1)
  })

  it('disables the XLSX export action while generating', () => {
    mockIsExportingXlsx = true

    render(<DockHeaderBar {...baseProps} />)

    expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled()
  })

  it('opens the jump-to-form palette when command bar button is clicked', () => {
    render(<DockHeaderBar {...baseProps} />)

    fireEvent.click(screen.getByRole('button', { name: /open command palette/i }))
    expect(mockSetPaletteOpen).toHaveBeenCalledTimes(1)
  })

  it('opens the review queue modal from header action', () => {
    render(
      <DockHeaderBar
        year={2025}
        availableYears={[2025, 2024]}
        isLoading={false}
        onYearChange={jest.fn()}
        pendingReviewCount={3}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /review queue/i }))
    expect(mockOpenReviewQueue).toHaveBeenCalledTimes(1)
  })

  it('hides the review queue button when there are no pending items', () => {
    render(<DockHeaderBar {...baseProps} />)

    expect(screen.queryByRole('button', { name: /review queue/i })).not.toBeInTheDocument()
  })

  it('calls back when year selection changes', () => {
    const onYearChange = jest.fn()

    render(
      <DockHeaderBar
        year={2025}
        availableYears={[2025, 2024]}
        isLoading={false}
        onYearChange={onYearChange}
        pendingReviewCount={0}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /change year/i }))
    expect(onYearChange).toHaveBeenCalledWith(2024)
  })

  it('handles YearSelection "all" from the year selector', () => {
    const onYearChange = jest.fn()

    render(
      <DockHeaderBar
        year={2025}
        availableYears={[2025, 2024]}
        isLoading={false}
        onYearChange={onYearChange}
        pendingReviewCount={0}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /select all/i }))
    expect(onYearChange).toHaveBeenCalledWith('all')
  })
})
