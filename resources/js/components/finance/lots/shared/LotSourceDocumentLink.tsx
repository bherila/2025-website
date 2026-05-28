import { ExternalLink, FileText } from 'lucide-react'
import React from 'react'

import type { NormalizedLot } from '@/types/finance/normalized-lot'

interface LotSourceDocumentLinkProps {
  lot: NormalizedLot
  className?: string
}

export function LotSourceDocumentLink({ lot, className = '' }: LotSourceDocumentLinkProps): React.ReactElement {
  const links: React.ReactElement[] = []

  if (lot.document_id !== null && lot.capabilities.includes('view_source_document')) {
    links.push(
      <a
        key="document"
        href={`/finance/documents?document_id=${lot.document_id}`}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <FileText className="h-3.5 w-3.5" />
        Document #{lot.document_id}
      </a>,
    )
  }

  if (lot.statement_id !== null && lot.capabilities.includes('view_statement')) {
    links.push(
      <a
        key="statement"
        href={`/finance/account/${lot.account_id}/statements?statement_id=${lot.statement_id}`}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Statement #{lot.statement_id}
      </a>,
    )
  }

  if (links.length === 0) {
    return <span className={`text-xs text-muted-foreground ${className}`}>No source</span>
  }

  return <div className={`flex flex-col gap-1 ${className}`}>{links}</div>
}
