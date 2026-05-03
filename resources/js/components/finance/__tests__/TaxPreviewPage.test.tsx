import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import TaxPreviewPage from '../TaxPreviewPage'

const mockTaxPreview = {
  year: 2025,
  availableYears: [2025, 2024],
  isLoading: false,
  error: null,
  pendingReviewCount: 0,
  taxReturn: { year: 2025 },
}

jest.mock('../TaxPreviewContext', () => ({
  TaxPreviewProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useTaxPreview: () => mockTaxPreview,
}))

jest.mock('../tax-preview/DockActions', () => ({
  DockActionsProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="dock-actions">{children}</div>
  ),
}))

jest.mock('../tax-preview/DockHeaderBar', () => ({
  DockHeaderBar: ({ selectedYear }: { selectedYear: number }) => (
    <div data-testid="dock-header">Year {selectedYear}</div>
  ),
}))

jest.mock('../tax-preview/DockHomeView', () => ({
  DockHomeView: () => <div data-testid="dock-home" />,
}))

jest.mock('../tax-preview/MillerShell', () => ({
  MillerShell: () => <div data-testid="miller-shell" />,
}))

jest.mock('../tax-preview/registry', () => ({
  formRegistry: {},
}))

jest.mock('../tax-preview/TaxEstimateHeader', () => ({
  TaxEstimateHeader: () => <div data-testid="tax-estimate-header" />,
}))

describe('TaxPreviewPage', () => {
  it('renders the dock UI by default without a dock query parameter', () => {
    window.history.pushState(null, '', '/finance/tax-preview?year=2025')

    render(<TaxPreviewPage initialData={{ year: 2025, availableYears: [2025, 2024] }} />)

    expect(screen.getByTestId('dock-actions')).toBeInTheDocument()
    expect(screen.getByTestId('dock-header')).toHaveTextContent('Year 2025')
    expect(screen.getByTestId('miller-shell')).toBeInTheDocument()
  })

  it('ignores dock query parameters and still renders the dock UI', () => {
    window.history.pushState(null, '', '/finance/tax-preview?year=2025&dock=0')

    render(<TaxPreviewPage initialData={{ year: 2025, availableYears: [2025, 2024] }} />)

    expect(screen.getByTestId('dock-actions')).toBeInTheDocument()
    expect(screen.getByTestId('miller-shell')).toBeInTheDocument()
  })
})
