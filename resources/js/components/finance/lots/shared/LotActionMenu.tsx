import { ExternalLink, FileSearch, FileText, MoreHorizontal } from 'lucide-react'
import React from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { NormalizedLot } from '@/types/finance/normalized-lot'

interface LotActionMenuProps {
  lot: NormalizedLot
  className?: string
}

export function LotActionMenu({ lot, className = '' }: LotActionMenuProps): React.ReactElement {
  const canOpenDocument = lot.document_id !== null && lot.capabilities.includes('view_source_document')
  const canOpenStatement = lot.statement_id !== null && lot.capabilities.includes('view_statement')
  const canOpenReconciliation = lot.document_id !== null && lot.link_id !== null && lot.capabilities.includes('open_reconciliation')
  const hasActions = canOpenDocument || canOpenStatement || canOpenReconciliation

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className={className}
          aria-label={`Actions for lot ${lot.id}`}
          disabled={!hasActions}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canOpenDocument && (
          <DropdownMenuItem asChild>
            <a href={`/finance/documents?document_id=${lot.document_id}`}>
              <FileText className="h-4 w-4" />
              Open source document
            </a>
          </DropdownMenuItem>
        )}
        {canOpenStatement && (
          <DropdownMenuItem asChild>
            <a href={`/finance/${lot.account_id}/statements?statement_id=${lot.statement_id}`}>
              <ExternalLink className="h-4 w-4" />
              Open statement
            </a>
          </DropdownMenuItem>
        )}
        {canOpenReconciliation && (
          <DropdownMenuItem asChild>
            <a href={`/finance/tax-documents/${lot.document_id}/lot-reconciliation`}>
              <FileSearch className="h-4 w-4" />
              Open reconciliation
            </a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
