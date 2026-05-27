import { FileText } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

import DocumentEmptyState from './DocumentEmptyState'
import DocumentRowActions from './DocumentRowActions'
import type { FinanceDocument } from './types'
import { KIND_LABELS } from './types'

interface DocumentsTableProps {
  documents: FinanceDocument[]
  isLoading: boolean
  onRowClick: (doc: FinanceDocument) => void
  onView: ((doc: FinanceDocument) => void) | undefined
  onDownload: ((doc: FinanceDocument) => void) | undefined
  onDelete: ((doc: FinanceDocument) => void) | undefined
}

export default function DocumentsTable({
  documents,
  isLoading,
  onRowClick,
  onView,
  onDownload,
  onDelete,
}: DocumentsTableProps) {
  if (isLoading) {
    return <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading documents...</div>
  }

  if (documents.length === 0) {
    return <DocumentEmptyState />
  }

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="grid grid-cols-[minmax(0,1.5fr)_120px_160px_100px_50px] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium uppercase text-muted-foreground max-lg:hidden">
        <span>Document</span>
        <span>Kind</span>
        <span>Accounts</span>
        <span>Status</span>
        <span></span>
      </div>
      <div className="divide-y">
        {documents.map((doc) => (
          <DocumentRow
            key={doc.id}
            document={doc}
            onClick={() => onRowClick(doc)}
            onView={onView}
            onDownload={onDownload}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

interface DocumentRowProps {
  document: FinanceDocument
  onClick: () => void
  onView: ((doc: FinanceDocument) => void) | undefined
  onDownload: ((doc: FinanceDocument) => void) | undefined
  onDelete: ((doc: FinanceDocument) => void) | undefined
}

function DocumentRow({ document, onClick, onView, onDownload, onDelete }: DocumentRowProps) {
  const accountLabels = (document.accounts ?? [])
    .map((link) => link.account?.acct_name ?? link.account_section_label)
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')

  return (
    <div
      className="grid cursor-pointer grid-cols-1 gap-2 px-3 py-3 hover:bg-muted/30 lg:grid-cols-[minmax(0,1.5fr)_120px_160px_100px_50px] lg:items-center"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick()
      }}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/40">
          <FileText className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {document.original_filename ?? `Document ${document.id}`}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {document.tax_year && <span>{document.tax_year}</span>}
            {document.period_end && (
              <span>
                {document.period_start ? `${document.period_start} to ${document.period_end}` : document.period_end}
              </span>
            )}
          </div>
        </div>
      </div>

      <div>
        <Badge variant="secondary">{KIND_LABELS[document.document_kind] ?? document.document_kind}</Badge>
      </div>

      <div className="min-w-0 text-sm text-muted-foreground">
        {accountLabels.length > 0 ? accountLabels.slice(0, 2).join(', ') : 'Unassigned'}
        {accountLabels.length > 2 && ` +${accountLabels.length - 2}`}
      </div>

      <div className="text-sm text-muted-foreground">
        {document.genai_status ?? document.tax_document?.genai_status ?? 'ready'}
      </div>

      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        <DocumentRowActions document={document} onView={onView} onDownload={onDownload} onDelete={onDelete} />
      </div>
    </div>
  )
}
