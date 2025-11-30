import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import currency from 'currency.js'
import type { IbStatementData } from '@/data/finance/parseIbCsv'

/**
 * Format a number as currency
 */
function formatCurrency(value: number | null): string {
  if (value === null) return '—'
  return currency(value).format()
}

interface IbStatementDetailModalProps {
  statement: IbStatementData
  children: React.ReactNode
}

/**
 * Modal dialog showing IB statement details with tabbed sections
 * for NAV, positions, cash report, and performance.
 */
export function IbStatementDetailModal({ statement, children }: IbStatementDetailModalProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {statement.info.brokerName} Statement: {statement.info.periodStart ?? ''} to {statement.info.periodEnd ?? ''}
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="nav">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="nav">NAV</TabsTrigger>
            <TabsTrigger value="positions">Positions ({statement.positions.length})</TabsTrigger>
            <TabsTrigger value="cash">Cash Report</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>
          <TabsContent value="nav" className="mt-4">
            {statement.totalNav && (
              <div className="mb-4 p-3 bg-muted rounded">
                <div className="text-center">
                  <span className="text-sm text-muted-foreground">Total NAV</span>
                  <div className="font-medium text-lg">{formatCurrency(statement.totalNav)}</div>
                </div>
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Asset Class</th>
                  <th className="text-right py-2">Prior</th>
                  <th className="text-right py-2">Current Long</th>
                  <th className="text-right py-2">Current Short</th>
                  <th className="text-right py-2">Current Total</th>
                  <th className="text-right py-2">Change</th>
                </tr>
              </thead>
              <tbody>
                {statement.nav.map((row, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="py-2">{row.assetClass}</td>
                    <td className="text-right">{formatCurrency(row.priorTotal)}</td>
                    <td className="text-right">{formatCurrency(row.currentLong)}</td>
                    <td className="text-right">{formatCurrency(row.currentShort)}</td>
                    <td className="text-right">{formatCurrency(row.currentTotal)}</td>
                    <td className="text-right">{formatCurrency(row.changeAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabsContent>
          <TabsContent value="positions" className="mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Symbol</th>
                  <th className="text-right py-2">Quantity</th>
                  <th className="text-right py-2">Price</th>
                  <th className="text-right py-2">Market Value</th>
                  <th className="text-right py-2">Cost Basis</th>
                  <th className="text-right py-2">Unrealized P&L</th>
                </tr>
              </thead>
              <tbody>
                {statement.positions.map((pos, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="py-2">
                      {pos.symbol}
                      {pos.optType && (
                        <span className="text-xs text-muted-foreground ml-1">
                          {pos.optType.toUpperCase()} ${pos.optStrike} {pos.optExpiration}
                        </span>
                      )}
                    </td>
                    <td className="text-right">{pos.quantity}</td>
                    <td className="text-right">{formatCurrency(pos.closePrice)}</td>
                    <td className="text-right">{formatCurrency(pos.marketValue)}</td>
                    <td className="text-right">{formatCurrency(pos.costBasis)}</td>
                    <td className={`text-right ${pos.unrealizedPl !== null && pos.unrealizedPl < 0 ? 'text-red-500' : pos.unrealizedPl !== null && pos.unrealizedPl > 0 ? 'text-green-500' : ''}`}>
                      {formatCurrency(pos.unrealizedPl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabsContent>
          <TabsContent value="cash" className="mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Currency</th>
                  <th className="text-left py-2">Line Item</th>
                  <th className="text-right py-2">Total</th>
                  <th className="text-right py-2">Securities</th>
                  <th className="text-right py-2">Futures</th>
                </tr>
              </thead>
              <tbody>
                {statement.cashReport.map((row, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="py-2">{row.currency}</td>
                    <td className="py-2">{row.lineItem}</td>
                    <td className="text-right">{formatCurrency(row.total)}</td>
                    <td className="text-right">{formatCurrency(row.securities)}</td>
                    <td className="text-right">{formatCurrency(row.futures)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabsContent>
          <TabsContent value="performance" className="mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Symbol</th>
                  <th className="text-right py-2">Quantity</th>
                  <th className="text-right py-2">Realized Total</th>
                  <th className="text-right py-2">Unrealized Total</th>
                  <th className="text-right py-2">Total P&L</th>
                </tr>
              </thead>
              <tbody>
                {statement.performance.map((row, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="py-2">{row.symbol || row.assetCategory}</td>
                    <td className="text-right">{row.currentQuantity}</td>
                    <td className="text-right">{formatCurrency(row.realizedTotal)}</td>
                    <td className="text-right">{formatCurrency(row.unrealizedTotal)}</td>
                    <td className={`text-right font-medium ${row.totalPl !== null && row.totalPl < 0 ? 'text-red-500' : row.totalPl !== null && row.totalPl > 0 ? 'text-green-500' : ''}`}>
                      {formatCurrency(row.totalPl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
