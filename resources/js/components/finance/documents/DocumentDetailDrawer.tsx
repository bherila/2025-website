import { useCallback, useEffect, useState } from 'react'

import { fetchWrapper } from '@/fetchWrapper'

import DocumentDrawerHeader from './DocumentDrawerHeader'
import DocumentImpactPreview from './DocumentImpactPreview'
import type { FinanceDocument, FinanceDocumentDetail } from './types'

interface DocumentDetailDrawerProps {
  document: FinanceDocument | null
  onClose: () => void
  onDeleted: () => void
}

export default function DocumentDetailDrawer({ document, onClose, onDeleted }: DocumentDetailDrawerProps) {
  const [detail, setDetail] = useState<FinanceDocumentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const loadDetail = useCallback(async (docId: number) => {
    setIsLoading(true)
    try {
      const data = (await fetchWrapper.get(`/api/finance/documents/${docId}`)) as FinanceDocumentDetail
      setDetail(data)
    } catch {
      // Detail load failure — use base document data
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (document) {
      setDetail(null) // eslint-disable-line @eslint-react/set-state-in-effect
      void loadDetail(document.id)
    }
    // Reset delete state when document changes
    setShowDeleteConfirm(false) // eslint-disable-line @eslint-react/set-state-in-effect
    setDeleteError(null) // eslint-disable-line @eslint-react/set-state-in-effect
    if (!document) {
      setDetail(null) // eslint-disable-line @eslint-react/set-state-in-effect
    }
  }, [document, loadDetail])

  if (!document) return null

  const handleDelete = async (hash: string) => {
    setDeleteError(null)
    try {
      await fetchWrapper.delete(`/api/finance/documents/${document.id}`, { impact_hash: hash })
      onDeleted()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete document')
    }
  }

  const displayDoc = detail ?? document
  const accounts = displayDoc.accounts ?? []
  const capabilities = displayDoc.capabilities ?? []

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l bg-background shadow-xl">
      <DocumentDrawerHeader document={displayDoc} onClose={onClose} />

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading details...</div>
        ) : showDeleteConfirm ? (
          <>
            <DocumentImpactPreview
              document={document}
              onConfirmDelete={(hash) => void handleDelete(hash)}
              onCancel={() => setShowDeleteConfirm(false)}
            />
            {deleteError && (
              <div className="mx-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {deleteError}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            {/* Metadata section */}
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Details</h3>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {displayDoc.original_filename && (
                  <>
                    <dt className="text-muted-foreground">Filename</dt>
                    <dd className="truncate">{displayDoc.original_filename}</dd>
                  </>
                )}
                {displayDoc.mime_type && (
                  <>
                    <dt className="text-muted-foreground">Type</dt>
                    <dd>{displayDoc.mime_type}</dd>
                  </>
                )}
                {'human_file_size' in displayDoc && displayDoc.human_file_size && (
                  <>
                    <dt className="text-muted-foreground">Size</dt>
                    <dd>{displayDoc.human_file_size}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Status</dt>
                <dd>{displayDoc.genai_status ?? 'ready'}</dd>
                <dt className="text-muted-foreground">Reviewed</dt>
                <dd>{displayDoc.is_reviewed ? 'Yes' : 'No'}</dd>
              </dl>
            </section>

            {/* Accounts section */}
            {accounts.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Linked accounts</h3>
                <ul className="space-y-1 text-sm">
                  {accounts.map((link) => (
                    <li key={link.id} className="flex items-center gap-2">
                      <span>{link.account?.acct_name ?? link.ai_account_name ?? 'Unassigned'}</span>
                      {link.form_type && (
                        <span className="text-xs text-muted-foreground">({link.form_type})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Statements facet placeholder */}
            {detail?.statements && detail.statements.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Statements</h3>
                <ul className="space-y-1 text-sm">
                  {detail.statements.map((stmt) => (
                    <li key={stmt.id}>
                      Statement #{stmt.id}
                      {stmt.statement_closing_date && ` — ${stmt.statement_closing_date}`}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Lots facet placeholder */}
            {detail?.lot_summary && detail.lot_summary.count > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Lots</h3>
                <p className="text-sm">{detail.lot_summary.count} lot(s) associated with this document.</p>
              </section>
            )}

            {/* Actions */}
            {capabilities.includes('delete') && (
              <div className="border-t pt-4">
                <button
                  className="text-sm text-destructive hover:underline"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete this document...
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
