'use client'

import { useCallback, useMemo, useState } from 'react'

import { fetchWrapper } from '@/fetchWrapper'
import type { TaxReturnPdfExportPayload, TaxReturnPdfExportResult } from '@/types/finance/tax-return-pdf'
import type { TaxPreviewXlsxExportOptions, TaxPreviewXlsxExportPayload, XlsxExportScope, XlsxGridSheet } from '@/types/finance/xlsx-export'

import { buildK1AllInOneXlsxGrids } from './K1AllInOneView'
import { buildK3AllInOneXlsxGrids } from './K3AllInOneView'
import { DockActionsProvider } from './tax-preview/DockActions'
import { DockHeaderBar } from './tax-preview/DockHeaderBar'
import { DockHomeView } from './tax-preview/DockHomeView'
import { MillerShell } from './tax-preview/MillerShell'
import { formRegistry as dockRegistry } from './tax-preview/registry'
import { TaxEstimateHeader } from './tax-preview/TaxEstimateHeader'
import { TaxPreviewProvider, type TaxPreviewShellData, useTaxPreview } from './TaxPreviewContext'
import { TaxReturnPdfExportDialog } from './TaxReturnPdfExportDialog'

/** Data preloaded server-side in the Blade template <script> tag. */
export type TaxPreviewPreload = TaxPreviewShellData

function TaxPreviewPageContent(): React.ReactElement {
  const {
    year: selectedYear,
    availableYears,
    isLoading,
    error,
    pendingReviewCount,
    reviewedK1Docs,
    taxFacts,
  } = useTaxPreview()
  const [isExportingXlsx, setIsExportingXlsx] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false)
  const fullExportGrids = useMemo<XlsxGridSheet[]>(() => {
    return [
      ...buildK1AllInOneXlsxGrids(reviewedK1Docs, taxFacts),
      ...buildK3AllInOneXlsxGrids(reviewedK1Docs),
    ]
  }, [reviewedK1Docs, taxFacts])

  const handleYearChange = useCallback((year: number | 'all') => {
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

  const handleExportXlsx = useCallback(async (options: TaxPreviewXlsxExportOptions = {}) => {
    const scope = options.scope ?? 'full'
    if (scope === 'full' && isLoading) {
      return
    }

    setIsExportingXlsx(true)
    try {
      const fallbackFilename = options.filename ?? defaultXlsxFilename(scope, selectedYear)
      const grids = options.grids ?? (scope === 'full' ? fullExportGrids : [])
      const payload: TaxPreviewXlsxExportPayload = {
        year: selectedYear,
        filename: fallbackFilename,
        scope,
      }

      if (grids.length > 0) {
        payload.grids = grids
      }

      const response = await fetchWrapper.postRaw('/api/finance/tax-preview/export-xlsx', payload)
      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`)
      }
      const blob = await response.blob()
      const contentDisposition = response.headers.get('content-disposition')
      const filename = contentDisposition?.match(/filename="([^"]+)"/)?.[1] ?? fallbackFilename
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
      setIsExportingXlsx(false)
    }
  }, [fullExportGrids, isLoading, selectedYear])

  const handleExportPdf = useCallback(async (payload: TaxReturnPdfExportPayload): Promise<TaxReturnPdfExportResult> => {
    if (isLoading) {
      return { ok: false, errors: ['Tax Preview data is still loading.'], warnings: [] }
    }

    setIsExportingPdf(true)
    try {
      const response = await fetchWrapper.postRaw('/finance/tax-preview/export-pdf', payload)
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null) as {
          message?: string
          errors?: string[]
          warnings?: string[]
        } | null

        return {
          ok: false,
          message: errorPayload?.message ?? `Export failed with status ${response.status}`,
          errors: errorPayload?.errors ?? [`Export failed with status ${response.status}`],
          warnings: errorPayload?.warnings ?? [],
        }
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get('content-disposition')
      const filename = contentDisposition?.match(/filename="([^"]+)"/)?.[1] ?? payload.filename ?? `${payload.year}-form-1040.pdf`
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      return { ok: true, errors: [], warnings: pdfWarningsFromHeader(response.headers) }
    } catch (error) {
      console.error('Failed to export IRS PDF', error)

      return { ok: false, errors: ['Failed to export IRS PDF.'], warnings: [] }
    } finally {
      setIsExportingPdf(false)
    }
  }, [isLoading])

  const hasColumns = typeof window !== 'undefined' && window.location.hash.length > 1

  return (
    <DockActionsProvider
      exportXlsx={handleExportXlsx}
      isExportingXlsx={isExportingXlsx}
      openTaxReturnPdfExport={() => setPdfDialogOpen(true)}
      isExportingPdf={isExportingPdf}
    >
      <div className="flex h-full flex-col">
        <DockHeaderBar
          selectedYear={selectedYear}
          availableYears={availableYears}
          isExportXlsxDisabled={isLoading}
          isExportPdfDisabled={isLoading}
          isLoadingYears={isLoading && availableYears.length === 0}
          pendingReviewCount={pendingReviewCount}
          onYearChange={handleYearChange}
        />
        {error && <div className="border-b border-border px-4 py-2 text-sm text-destructive">{error}</div>}
        <TaxEstimateHeader defaultTier={hasColumns ? 'slim' : 'expanded'} />
        <div className="relative min-h-0 flex-1">
          <MillerShell registry={dockRegistry} homeView={<DockHomeView />} />
        </div>
      </div>
      <TaxReturnPdfExportDialog
        open={pdfDialogOpen}
        year={selectedYear}
        isExporting={isExportingPdf}
        onOpenChange={setPdfDialogOpen}
        onExport={handleExportPdf}
      />
    </DockActionsProvider>
  )
}

function defaultXlsxFilename(scope: XlsxExportScope, year: number): string {
  if (scope === 'k1-all-in-one') {
    return `tax-preview-${year}-all-k1s.xlsx`
  }

  if (scope === 'k3-all-in-one') {
    return `tax-preview-${year}-all-k3s.xlsx`
  }

  return `tax-preview-${year}.xlsx`
}

export default function TaxPreviewPage({ initialData }: { initialData?: TaxPreviewPreload | null }): React.ReactElement {
  return (
    <TaxPreviewProvider initialData={initialData ?? null}>
      <TaxPreviewPageContent />
    </TaxPreviewProvider>
  )
}

function pdfWarningsFromHeader(headers: Headers): string[] {
  const encoded = headers.get('x-tax-return-pdf-warnings')

  if (!encoded) {
    return []
  }

  try {
    const decoded = window.atob(encoded)
    const parsed = JSON.parse(decoded) as unknown

    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}
