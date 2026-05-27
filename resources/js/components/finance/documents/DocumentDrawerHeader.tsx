import { FileText, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

import type { FinanceDocument } from './types'
import { KIND_LABELS } from './types'

interface DocumentDrawerHeaderProps {
  document: FinanceDocument
  onClose: () => void
}

export default function DocumentDrawerHeader({ document, onClose }: DocumentDrawerHeaderProps) {
  return (
    <div className="flex items-start justify-between border-b px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted/40">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {document.original_filename ?? `Document ${document.id}`}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{KIND_LABELS[document.document_kind] ?? document.document_kind}</Badge>
            {document.tax_year && <span className="text-xs text-muted-foreground">{document.tax_year}</span>}
          </div>
        </div>
      </div>
      <button
        className="rounded-sm p-1 hover:bg-muted"
        onClick={onClose}
        aria-label="Close drawer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
