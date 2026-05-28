import { AlertTriangle, ArrowUpRight, ListChecks } from 'lucide-react'

import { Button } from '@/components/ui/button'

import type { FinanceDocumentStatementFacet } from './types'

interface StatementFacetProps {
  facet: FinanceDocumentStatementFacet
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`
}

export default function StatementFacet({ facet }: StatementFacetProps) {
  const accounts = facet.linked_accounts
    .map((link) => ({
      id: link.account_id ?? link.account?.acct_id ?? null,
      name: link.account?.acct_name ?? 'Unassigned',
      number: link.account?.acct_number ?? null,
    }))
    .filter((account) => account.id !== null)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase text-muted-foreground">Statement lineage</h3>
        <ListChecks className="h-4 w-4 text-muted-foreground" />
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Period</dt>
        <dd>
          {facet.period.start || facet.period.end
            ? `${facet.period.start ?? 'Start unknown'} to ${facet.period.end ?? 'End unknown'}`
            : 'Unknown'}
        </dd>
        <dt className="text-muted-foreground">Balances</dt>
        <dd>{countLabel(facet.balance_snapshots_count, 'snapshot')}</dd>
        <dt className="text-muted-foreground">Transactions</dt>
        <dd>{facet.imported_transactions_count.toLocaleString()}</dd>
        <dt className="text-muted-foreground">Lots</dt>
        <dd>{facet.imported_lots_count.toLocaleString()}</dd>
      </dl>

      {facet.parsed_data_needs_review && (
        <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>{countLabel(facet.parsed_data_warnings?.length ?? 0, 'warning')} need review.</span>
        </div>
      )}

      {accounts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase text-muted-foreground">Linked accounts</h4>
          <ul className="space-y-2">
            {accounts.map((account) => (
              <li key={account.id} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{account.name}</div>
                    {account.number && <div className="text-xs text-muted-foreground">{account.number}</div>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2">
                      <a href={`/finance/account/${account.id}/transactions?source_document_id=${facet.document_id}`}>
                        Txns
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2">
                      <a href={`/finance/account/${account.id}/lots?source_document_id=${facet.document_id}&status=all`}>
                        Lots
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {facet.statements.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase text-muted-foreground">Snapshots</h4>
          <ul className="space-y-1 text-sm">
            {facet.statements.map((statement) => (
              <li key={statement.id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  #{statement.id}
                  {statement.statement_closing_date ? ` - ${statement.statement_closing_date}` : ''}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {countLabel(statement.imported_transactions_count ?? 0, 'txn')}
                  {', '}
                  {countLabel(statement.imported_lots_count ?? 0, 'lot')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
