import { ArrowUpRight, Boxes } from 'lucide-react'

import { Button } from '@/components/ui/button'

import type { FinanceDocumentAccount, FinanceDocumentLotSummaryFacet } from './types'

interface LotSummaryFacetProps {
  documentId: number
  summary: FinanceDocumentLotSummaryFacet
  accounts: FinanceDocumentAccount[]
}

function labelForKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function CountRows({ counts }: { counts: Record<string, number> | undefined }) {
  const rows = Object.entries(counts ?? {}).filter(([, count]) => count > 0)

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No categorized lots.</p>
  }

  return (
    <ul className="space-y-1 text-sm">
      {rows.map(([key, count]) => (
        <li key={key} className="flex items-center justify-between gap-2">
          <span>{labelForKey(key)}</span>
          <span className="font-medium">{count.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  )
}

export default function LotSummaryFacet({ documentId, summary, accounts }: LotSummaryFacetProps) {
  if (summary.count <= 0) return null

  const firstAccountId = accounts.find((link) => link.account_id !== null)?.account_id ?? null

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase text-muted-foreground">Lot summary</h3>
        <Boxes className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{summary.count.toLocaleString()} linked lot{summary.count === 1 ? '' : 's'}</span>
        {firstAccountId && (
          <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2">
            <a href={`/finance/account/${firstAccountId}/lots?source_document_id=${documentId}`}>
              Open
              <ArrowUpRight className="h-3 w-3" />
            </a>
          </Button>
        )}
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <h4 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Source</h4>
          <CountRows counts={summary.counts_by_source} />
        </div>
        <div>
          <h4 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Reconciliation</h4>
          <CountRows counts={summary.counts_by_reconciliation_state} />
        </div>
      </div>
    </section>
  )
}
