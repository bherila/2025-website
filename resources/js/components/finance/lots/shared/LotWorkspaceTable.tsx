import currency from 'currency.js'
import React from 'react'

import type { NormalizedLot } from '@/types/finance/normalized-lot'

import { LotReconciliationBadge } from './LotReconciliationBadge'
import { LotSourceBadge } from './LotSourceBadge'

interface LotWorkspaceTableProps {
  lots: NormalizedLot[]
  showAccount?: boolean
  showReconciliation?: boolean
  className?: string
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parseInt(parts[1]!)}/${parseInt(parts[2]!)}/${parts[0]!.slice(2)}`
}

function fmtMoney(value: string | null): string {
  if (value === null || value === undefined) return '—'
  return currency(value, { precision: 2 }).format()
}

export function LotWorkspaceTable({
  lots,
  showAccount = false,
  showReconciliation = false,
  className = '',
}: LotWorkspaceTableProps): React.ReactElement {
  if (lots.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">No lots found.</div>
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-2 py-1.5">Symbol</th>
            {showAccount && <th className="px-2 py-1.5">Account</th>}
            <th className="px-2 py-1.5">Source</th>
            <th className="px-2 py-1.5 text-right">Qty</th>
            <th className="px-2 py-1.5">Acquired</th>
            <th className="px-2 py-1.5">Sold</th>
            <th className="px-2 py-1.5 text-right">Basis</th>
            <th className="px-2 py-1.5 text-right">Proceeds</th>
            <th className="px-2 py-1.5 text-right">Gain/Loss</th>
            {showReconciliation && <th className="px-2 py-1.5">Recon.</th>}
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => (
            <tr key={lot.id} className="border-b hover:bg-muted/50">
              <td className="px-2 py-1.5 font-medium">{lot.symbol}</td>
              {showAccount && (
                <td className="px-2 py-1.5 text-xs text-muted-foreground">
                  {lot.account_name ?? `#${lot.account_id}`}
                </td>
              )}
              <td className="px-2 py-1.5">
                <LotSourceBadge source={lot.source} />
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{parseFloat(lot.quantity).toLocaleString()}</td>
              <td className="px-2 py-1.5 tabular-nums">{fmtDate(lot.acquired_date)}</td>
              <td className="px-2 py-1.5 tabular-nums">{fmtDate(lot.sold_date)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(lot.basis)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(lot.proceeds)}</td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${
                lot.realized_gain !== null && parseFloat(lot.realized_gain) >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                {fmtMoney(lot.realized_gain)}
              </td>
              {showReconciliation && (
                <td className="px-2 py-1.5">
                  <LotReconciliationBadge state={lot.reconciliation_state} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
