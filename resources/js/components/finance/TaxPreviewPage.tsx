'use client'

import { useCallback, useState } from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import { buildTaxWorkbook } from '@/lib/finance/buildTaxWorkbook'
import type { YearSelection } from '@/lib/financeRouteBuilder'

import { DockActionsProvider } from './tax-preview/DockActions'
import { DockHeaderBar } from './tax-preview/DockHeaderBar'
import { DockHomeView } from './tax-preview/DockHomeView'
import { MillerShell } from './tax-preview/MillerShell'
import { formRegistry as dockRegistry } from './tax-preview/registry'
import { TaxEstimateHeader } from './tax-preview/TaxEstimateHeader'
import { TaxPreviewProvider, type TaxPreviewShellData, useTaxPreview } from './TaxPreviewContext'

/** Data preloaded server-side in the Blade template <script> tag. */
export type TaxPreviewPreload = TaxPreviewShellData

function TaxPreviewPageContent(): React.ReactElement {
  const {
    year: selectedYear,
    availableYears,
    isLoading,
    pendingReviewCount,
    taxReturn,
  } = useTaxPreview()

  const [isExporting, setIsExporting] = useState(false)

  const handleYearChange = useCallback((year: YearSelection) => {
    if (typeof year !== 'number') {
      return
    }

    const url = new URL(window.location.href)
    const defaultYear = new Date().getFullYear()
    url.searchParams.delete('dock')
    if (year === defaultYear) {
      url.searchParams.delete('year')
    } else {
      url.searchParams.set('year', String(year))
    }
    window.location.href = url.toString()
  }, [])

  const handleExportXlsx = useCallback(async () => {
    setIsExporting(true)
    try {
      const workbook = buildTaxWorkbook(taxReturn)
      const response = await fetchWrapper.postRaw('/api/finance/tax-preview/export-xlsx', workbook)
      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`)
      }
      const blob = await response.blob()
      const contentDisposition = response.headers.get('content-disposition')
      const filename = contentDisposition?.match(/filename="([^"]+)"/)?.[1] ?? workbook.filename
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export tax preview workbook', error)
    } finally {
      setIsExporting(false)
    }
  }, [taxReturn])

  const hasColumns = typeof window !== 'undefined' && window.location.hash.length > 1

  return (
    <DockActionsProvider exportXlsx={handleExportXlsx} isExportingXlsx={isExporting}>
      <div className="flex h-full flex-col">
        <DockHeaderBar
          year={selectedYear}
          availableYears={availableYears}
          isLoading={isLoading && availableYears.length === 0}
          onYearChange={handleYearChange}
          pendingReviewCount={pendingReviewCount}
        />
        <TaxEstimateHeader defaultTier={hasColumns ? 'slim' : 'expanded'} />
        <div className="relative min-h-0 flex-1">
          <MillerShell registry={dockRegistry} homeView={<DockHomeView />} />
        </div>
      </div>
    </DockActionsProvider>
  )
}

export default function TaxPreviewPage({ initialData }: { initialData?: TaxPreviewPreload | null }) {
  return (
    <TaxPreviewProvider initialData={initialData ?? null}>
      <TaxPreviewPageContent />
    </TaxPreviewProvider>
  )
}
