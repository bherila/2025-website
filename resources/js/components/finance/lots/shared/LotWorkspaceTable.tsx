import currency from 'currency.js'
import React from 'react'

import type { NormalizedLot } from '@/types/finance/normalized-lot'

import { LotActionMenu } from './LotActionMenu'
import { LotReconciliationBadge } from './LotReconciliationBadge'
import { LotSourceBadge } from './LotSourceBadge'
import { LotSourceDocumentLink } from './LotSourceDocumentLink'

interface LotWorkspaceTableProps {
  lots: NormalizedLot[]
  showAccount?: boolean
  showDescription?: boolean
  showTerm?: boolean
  showReconciliation?: boolean
  showSourceDocument?: boolean
  showTransactionLinks?: boolean
  showActions?: boolean
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

function fmtUnitBasis(lot: NormalizedLot): string {
  const basis = Number(lot.basis)
  const quantity = Number(lot.quantity)

  if (!Number.isFinite(basis) || !Number.isFinite(quantity) || quantity === 0) {
    return '—'
  }

  return currency(basis, { precision: 4 }).divide(quantity).format()
}

export function LotWorkspaceTable({
  lots,
  showAccount = false,
  showDescription = false,
  showTerm = false,
  showReconciliation = false,
  showSourceDocument = false,
  showTransactionLinks = false,
  showActions = false,
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
            <th className="px-2 py-1.5 text-right">Basis/Unit</th>
            <th className="px-2 py-1.5 text-right">Proceeds</th>
            <th className="px-2 py-1.5 text-right">Gain/Loss</th>
            {showTerm && <th className="px-2 py-1.5">Type</th>}
            {showReconciliation && <th className="px-2 py-1.5">Recon.</th>}
            {showSourceDocument && <th className="px-2 py-1.5">Source Document</th>}
            {showTransactionLinks && <th className="px-2 py-1.5">Links</th>}
            {showActions && <th className="px-2 py-1.5 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => (
            <tr key={lot.id} className="border-b hover:bg-muted/50">
              <td className="px-2 py-1.5">
                <div className="font-medium">{lot.symbol}</div>
                {showDescription && lot.description && (
                  <div className="max-w-48 truncate text-xs text-muted-foreground">{lot.description}</div>
                )}
              </td>
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
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtUnitBasis(lot)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(lot.proceeds)}</td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${
                lot.realized_gain !== null && parseFloat(lot.realized_gain) >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                {fmtMoney(lot.realized_gain)}
              </td>
              {showTerm && (
                <td className="px-2 py-1.5">
                  {lot.is_short_term !== null ? (
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
                      {lot.is_short_term ? 'ST' : 'LT'}
                    </span>
                  ) : '—'}
                </td>
              )}
              {showReconciliation && (
                <td className="px-2 py-1.5">
                  <LotReconciliationBadge state={lot.reconciliation_state} />
                </td>
              )}
              {showSourceDocument && (
                <td className="px-2 py-1.5">
                  <LotSourceDocumentLink lot={lot} />
                </td>
              )}
              {showTransactionLinks && (
                <td className="px-2 py-1.5">
                  <div className="flex flex-col gap-1">
                    {lot.open_transaction_id !== null && (
                      <a href={`/finance/${lot.account_id}#t_id=${lot.open_transaction_id}`} className="text-xs text-primary hover:underline">
                        Buy #{lot.open_transaction_id}
                      </a>
                    )}
                    {lot.close_transaction_id !== null && (
                      <a href={`/finance/${lot.account_id}#t_id=${lot.close_transaction_id}`} className="text-xs text-primary hover:underline">
                        Sell #{lot.close_transaction_id}
                      </a>
                    )}
                    {lot.open_transaction_id === null && lot.close_transaction_id === null && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </td>
              )}
              {showActions && (
                <td className="px-2 py-1.5 text-right">
                  <LotActionMenu lot={lot} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
