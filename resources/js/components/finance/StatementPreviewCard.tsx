import currency from 'currency.js'
import type { IbStatementData } from '@/data/finance/parseIbCsv'
import { IbStatementDetailModal } from './IbStatementDetailModal'

/**
 * Format a number as currency
 */
function formatCurrency(value: number | null): string {
  if (value === null) return '—'
  return currency(value).format()
}

interface StatementPreviewCardProps {
  statement: IbStatementData
}

/**
 * Card showing a summary of IB statement data (broker, period, NAV, counts).
 * Clicking opens the IbStatementDetailModal with full statement details.
 */
export function StatementPreviewCard({ statement }: StatementPreviewCardProps) {
  return (
    <div className="my-4 p-4 border rounded-lg bg-muted/50">
      <IbStatementDetailModal statement={statement}>
        <div className="flex justify-between items-center cursor-pointer hover:bg-muted/70 p-2 rounded transition-colors">
          <div>
            <h3 className="font-medium text-lg">{statement.info.brokerName} Statement</h3>
            <p className="text-sm text-muted-foreground">
              {statement.info.period}
            </p>
          </div>
          <div className="text-right">
            <div className="font-medium">{formatCurrency(statement.totalNav)}</div>
            <span className="text-sm text-muted-foreground">
              {statement.positions.length} positions • {statement.nav.length} NAV rows • {statement.performance.length} performance
            </span>
          </div>
        </div>
      </IbStatementDetailModal>
    </div>
  )
}
