import { act, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import type { FK1StructuredData, K3Section } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

import TaxPreviewPage from '../TaxPreviewPage'

jest.mock('@/fetchWrapper', () => ({
  fetchWrapper: {
    postRaw: jest.fn(),
  },
}))

function k1Data(fields: FK1StructuredData['fields'], sections: K3Section[] = []): FK1StructuredData {
  return {
    schemaVersion: '2026.1',
    formType: 'K-1-1065',
    fields,
    codes: {},
    ...(sections.length > 0 ? { k3: { sections } } : {}),
  }
}

const reviewedK1Docs = [
  {
    id: 401,
    parsed_data: k1Data(
      { A: { value: '11-1111111' }, B: { value: 'Alpha Fund LP' }, '5': { value: '1000' } },
      [
        {
          sectionId: 'part2_section1',
          title: 'Part II',
          data: {
            rows: [
              { line: '1', description: 'Interest', col_c_passive: '500', col_g_total: '500' },
            ],
          },
        },
        {
          sectionId: 'part3_section4',
          title: 'Part III §4',
          data: {
            countries: [
              { country: 'Ireland', amount_usd: 75 },
            ],
          },
        },
      ],
    ),
    employment_entity: null,
  },
] as unknown as TaxDocument[]

const mockTaxPreview = {
  year: 2025,
  availableYears: [2025, 2024],
  isLoading: false,
  error: null,
  pendingReviewCount: 0,
  taxReturn: { year: 2025 },
  reviewedK1Docs,
  taxFacts: null,
}
let mockProvidedExportXlsx: (() => void | Promise<void>) | null = null

jest.mock('../TaxPreviewContext', () => ({
  TaxPreviewProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useTaxPreview: () => mockTaxPreview,
}))

jest.mock('../tax-preview/DockActions', () => ({
  DockActionsProvider: ({
    children,
    exportXlsx,
  }: {
    children: ReactNode
    exportXlsx: () => void | Promise<void>
  }) => {
    mockProvidedExportXlsx = exportXlsx

    return <div data-testid="dock-actions">{children}</div>
  },
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
  const mockPostRaw = fetchWrapper.postRaw as jest.Mock
  let clickSpy: jest.SpyInstance

  beforeEach(() => {
    mockProvidedExportXlsx = null
    mockPostRaw.mockResolvedValue({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(['xlsx'])),
      headers: { get: jest.fn(() => 'attachment; filename="tax-preview-2025.xlsx"') },
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:tax-preview'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn(),
    })
    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    mockPostRaw.mockReset()
    clickSpy.mockRestore()
  })

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

  it('posts All K-1s and All K-3s normalized grids with the full dock XLSX export', async () => {
    window.history.pushState(null, '', '/finance/tax-preview?year=2025')

    render(<TaxPreviewPage initialData={{ year: 2025, availableYears: [2025, 2024] }} />)

    await act(async () => {
      await mockProvidedExportXlsx?.()
    })

    await waitFor(() => expect(mockPostRaw).toHaveBeenCalledTimes(1))
    const payload = mockPostRaw.mock.calls[0]?.[1] as {
      year: number
      filename: string
      scope: string
      grids: Array<{ name: string; scope: string; rows: Array<{ label?: string }> }>
    }
    expect(mockPostRaw).toHaveBeenCalledWith('/api/finance/tax-preview/export-xlsx', expect.objectContaining({
      year: 2025,
      filename: 'tax-preview-2025.xlsx',
      scope: 'full',
    }))
    expect(payload.grids.map((grid) => grid.name)).toEqual(['All K-1s', 'All K-3s'])
    expect(payload.grids.find((grid) => grid.name === 'All K-1s')?.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '5 Interest income' }),
    ]))
    expect(payload.grids.find((grid) => grid.name === 'All K-3s')?.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'K-3 Part II — Foreign Income — Total' }),
      expect.objectContaining({ label: 'Foreign tax total (used)' }),
    ]))
  })
})
