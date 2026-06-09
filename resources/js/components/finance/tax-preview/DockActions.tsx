import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { isFK1StructuredData } from '@/components/finance/k1'
import TaxDocumentReviewModal from '@/components/finance/TaxDocumentReviewModal'
import { fetchWrapper } from '@/fetchWrapper'
import type { TaxDocument } from '@/types/finance/tax-document'
import type { TaxPreviewXlsxExporter } from '@/types/finance/xlsx-export'

import { useTaxPreview } from '../TaxPreviewContext'
import type { FormId } from './formRegistry'
import { WorksheetModal } from './WorksheetModal'

interface DockActionsValue {
  /** Export the current tax preview workbook. */
  exportXlsx: TaxPreviewXlsxExporter
  /** True while the current tax preview workbook is being generated. */
  isExportingXlsx: boolean
  /** Open the IRS PDF export dialog. */
  openTaxReturnPdfExport: () => void
  /** True while the current IRS PDF export is being generated. */
  isExportingPdf: boolean
  /** Open the document review modal for a specific K-1 document by id. */
  reviewK1Doc: (docId: number, focusFieldId?: string) => void
  /** Open the document review modal for any tax document by id. */
  openTaxDocumentDetail: (docId: number) => void
  /** Open the review modal in "select a document" mode (no specific doc). */
  openReviewQueue: () => void
  /** Bulk-update the K-3 sourcedByPartnerAsUSSource election across multiple K-1s.
   *  Pass `true` to confirm U.S.-source treatment (default; redundant but explicit) and
   *  `false` for treaty / non-U.S.-partner treatment (column (f) becomes foreign-source). */
  bulkSetSbpElection: (active: boolean, docIds: number[]) => Promise<string[]>
  /** Open a registry worksheet (presentation: 'modal') as a Dialog. */
  openWorksheet: (id: FormId) => void
  /** Close the active worksheet modal. */
  closeWorksheet: () => void
}

const DockActionsContext = createContext<DockActionsValue | null>(null)

interface DockActionsProviderProps {
  children: ReactNode
  exportXlsx?: TaxPreviewXlsxExporter
  isExportingXlsx?: boolean
  openTaxReturnPdfExport?: () => void
  isExportingPdf?: boolean
}

const noopExportXlsx = (): void => {}
const noopOpenTaxReturnPdfExport = (): void => {}

/**
 * Manages imperative dock-mode actions (modal opening, bulk K-1 mutations)
 * and renders the document review modal. Adapters reach these via
 * `useDockActions()` so they can wire up callbacks without threading
 * handlers through the registry shape.
 */
export function DockActionsProvider({
  children,
  exportXlsx,
  isExportingXlsx,
  openTaxReturnPdfExport,
  isExportingPdf,
}: DockActionsProviderProps): React.ReactElement {
  const { accountDocuments, allK1Documents, w2Documents, refreshAll, year: selectedYear, isLoading } = useTaxPreview()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewDoc, setReviewDoc] = useState<TaxDocument | undefined>(undefined)
  const [reviewFocusFieldId, setReviewFocusFieldId] = useState<string | undefined>(undefined)
  const [worksheetId, setWorksheetId] = useState<FormId | null>(null)
  const openWorksheet = useCallback((id: FormId) => setWorksheetId(id), [])
  const closeWorksheet = useCallback(() => setWorksheetId(null), [])

  const removeReviewDocumentQueryParam = useCallback(() => {
    if (typeof window === 'undefined') {
      return
    }

    const url = new URL(window.location.href)
    url.searchParams.delete('review_document_id')
    window.history.replaceState({}, '', url.toString())
  }, [])

  const openReviewDoc = useCallback(
    (docId: number, focusFieldId?: string) => {
      const target = [...accountDocuments, ...allK1Documents, ...w2Documents].find((doc) => doc.id === docId)
      if (!target) {
        return false
      }
      setReviewDoc(target)
      setReviewFocusFieldId(focusFieldId)
      setReviewOpen(true)
      return true
    },
    [accountDocuments, allK1Documents, w2Documents],
  )

  const reviewK1Doc = useCallback((docId: number, focusFieldId?: string) => {
    openReviewDoc(docId, focusFieldId)
  }, [openReviewDoc])

  const openTaxDocumentDetail = useCallback((docId: number) => {
    openReviewDoc(docId)
  }, [openReviewDoc])

  const openReviewQueue = useCallback(() => {
    setReviewDoc(undefined)
    setReviewFocusFieldId(undefined)
    setReviewOpen(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || isLoading) {
      return
    }

    const docParam = new URLSearchParams(window.location.search).get('review_document_id')
    if (!docParam) {
      return
    }

    const docId = Number(docParam)
    if (!Number.isInteger(docId) || docId <= 0) {
      removeReviewDocumentQueryParam()
      return
    }

    if (!openReviewDoc(docId)) {
      toast.error('Tax document is not available in the selected year')
    }
    removeReviewDocumentQueryParam()
  }, [isLoading, openReviewDoc, removeReviewDocumentQueryParam])

  const bulkSetSbpElection = useCallback(
    async (active: boolean, docIds: number[]): Promise<string[]> => {
      const failures: string[] = []
      for (const docId of docIds) {
        const target = accountDocuments.find((doc) => doc.id === docId)
        if (!target || !isFK1StructuredData(target.parsed_data)) {
          continue
        }
        try {
          await fetchWrapper.put(`/api/finance/tax-documents/${docId}`, {
            parsed_data: {
              ...target.parsed_data,
              k3Elections: {
                ...target.parsed_data.k3Elections,
                sourcedByPartnerAsUSSource: active,
              },
            },
          })
        } catch {
          failures.push(
            target.parsed_data.fields['B']?.value?.split('\n')[0] ??
              target.employment_entity?.display_name ??
              `K-1 #${docId}`,
          )
        }
      }
      await refreshAll()
      return failures
    },
    [accountDocuments, refreshAll],
  )

  const value = useMemo<DockActionsValue>(
    () => ({
      exportXlsx: exportXlsx ?? noopExportXlsx,
      isExportingXlsx: isExportingXlsx ?? false,
      openTaxReturnPdfExport: openTaxReturnPdfExport ?? noopOpenTaxReturnPdfExport,
      isExportingPdf: isExportingPdf ?? false,
      reviewK1Doc,
      openTaxDocumentDetail,
      openReviewQueue,
      bulkSetSbpElection,
      openWorksheet,
      closeWorksheet,
    }),
    [exportXlsx, isExportingXlsx, openTaxReturnPdfExport, isExportingPdf, reviewK1Doc, openTaxDocumentDetail, openReviewQueue, bulkSetSbpElection, openWorksheet, closeWorksheet],
  )

  return (
    <DockActionsContext.Provider value={value}>
      {children}
      <TaxDocumentReviewModal
        open={reviewOpen}
        taxYear={reviewDoc?.tax_year ?? selectedYear}
        {...(reviewDoc ? { document: reviewDoc } : {})}
        focusFieldId={reviewFocusFieldId}
        onClose={() => {
          setReviewDoc(undefined)
          setReviewFocusFieldId(undefined)
          setReviewOpen(false)
          removeReviewDocumentQueryParam()
        }}
        onDocumentReviewed={() => {
          setReviewDoc(undefined)
          setReviewFocusFieldId(undefined)
          setReviewOpen(false)
          void refreshAll()
        }}
      />
      <WorksheetModal worksheetId={worksheetId} onClose={closeWorksheet} />
    </DockActionsContext.Provider>
  )
}

export function useDockActions(): DockActionsValue {
  const ctx = useContext(DockActionsContext)
  if (!ctx) {
    throw new Error('useDockActions must be used inside DockActionsProvider')
  }
  return ctx
}
