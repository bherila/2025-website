import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

import { isFK1StructuredData } from '@/components/finance/k1'
import TaxDocumentReviewModal from '@/components/finance/TaxDocumentReviewModal'
import { fetchWrapper } from '@/fetchWrapper'
import type { TaxDocument } from '@/types/finance/tax-document'

import { useTaxPreview } from '../TaxPreviewContext'
import type { FormId } from './formRegistry'
import { WorksheetModal } from './WorksheetModal'

interface DockActionsValue {
  /** Export the current tax preview workbook. */
  exportXlsx: () => void
  /** True while the current tax preview workbook is being generated. */
  isExportingXlsx: boolean
  /** Open the document review modal for a specific K-1 document by id. */
  reviewK1Doc: (docId: number) => void
  /** Open the review modal in "select a document" mode (no specific doc). */
  openReviewQueue: () => void
  /** Bulk-update the K-3 sourcedByPartnerAsUSSource election across multiple K-1s. */
  bulkSetSbpElection: (active: boolean, docIds: number[]) => Promise<string[]>
  /** Open a registry worksheet (presentation: 'modal') as a Dialog. */
  openWorksheet: (id: FormId) => void
  /** Close the active worksheet modal. */
  closeWorksheet: () => void
  /** Whether the ⌘K command palette is currently open. */
  paletteOpen: boolean
  /** Imperatively open/close the palette (button trigger or programmatic). */
  setPaletteOpen: (next: boolean | ((prev: boolean) => boolean)) => void
}

const DockActionsContext = createContext<DockActionsValue | null>(null)

interface DockActionsProviderProps {
  children: ReactNode
  exportXlsx?: () => void
  isExportingXlsx?: boolean
}

const noopExportXlsx = (): void => {}

/**
 * Manages imperative dock-mode actions (modal opening, bulk K-1 mutations)
 * and renders the document review modal. Adapters reach these via
 * `useDockActions()` so they can wire up callbacks without threading
 * handlers through the registry shape.
 */
export function DockActionsProvider({ children, exportXlsx, isExportingXlsx }: DockActionsProviderProps): React.ReactElement {
  const { accountDocuments, refreshAll, year: selectedYear } = useTaxPreview()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewDoc, setReviewDoc] = useState<TaxDocument | undefined>(undefined)
  const [worksheetId, setWorksheetId] = useState<FormId | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const openWorksheet = useCallback((id: FormId) => setWorksheetId(id), [])
  const closeWorksheet = useCallback(() => setWorksheetId(null), [])

  const reviewK1Doc = useCallback(
    (docId: number) => {
      const target = accountDocuments.find((doc) => doc.id === docId)
      if (!target) {
        return
      }
      setReviewDoc(target)
      setReviewOpen(true)
    },
    [accountDocuments],
  )

  const openReviewQueue = useCallback(() => {
    setReviewDoc(undefined)
    setReviewOpen(true)
  }, [])

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
      reviewK1Doc,
      openReviewQueue,
      bulkSetSbpElection,
      openWorksheet,
      closeWorksheet,
      paletteOpen,
      setPaletteOpen,
    }),
    [exportXlsx, isExportingXlsx, reviewK1Doc, openReviewQueue, bulkSetSbpElection, openWorksheet, closeWorksheet, paletteOpen],
  )

  return (
    <DockActionsContext.Provider value={value}>
      {children}
      <TaxDocumentReviewModal
        open={reviewOpen}
        taxYear={selectedYear}
        {...(reviewDoc ? { document: reviewDoc } : {})}
        onClose={() => {
          setReviewDoc(undefined)
          setReviewOpen(false)
        }}
        onDocumentReviewed={() => {
          setReviewDoc(undefined)
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
