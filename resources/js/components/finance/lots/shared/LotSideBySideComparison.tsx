import React from 'react'

import type { NormalizedLot } from '@/types/finance/normalized-lot'

interface LotSideBySideComparisonProps {
  brokerLot: NormalizedLot | null
  accountLot: NormalizedLot | null
  className?: string
}

interface ComparisonField {
  label: string
  broker: string | null
  account: string | null
  hasDelta: boolean
}

function val(lot: NormalizedLot | null, field: keyof NormalizedLot): string {
  if (!lot) return '—'
  const v = lot[field]
  if (v === null || v === undefined) return '—'
  return String(v)
}

export function LotSideBySideComparison({
  brokerLot,
  accountLot,
  className = '',
}: LotSideBySideComparisonProps): React.ReactElement {
  const fields: ComparisonField[] = [
    { label: 'Symbol', broker: val(brokerLot, 'symbol'), account: val(accountLot, 'symbol'), hasDelta: val(brokerLot, 'symbol') !== val(accountLot, 'symbol') },
    { label: 'Quantity', broker: val(brokerLot, 'quantity'), account: val(accountLot, 'quantity'), hasDelta: val(brokerLot, 'quantity') !== val(accountLot, 'quantity') },
    { label: 'Acquired', broker: val(brokerLot, 'acquired_date'), account: val(accountLot, 'acquired_date'), hasDelta: val(brokerLot, 'acquired_date') !== val(accountLot, 'acquired_date') },
    { label: 'Sold', broker: val(brokerLot, 'sold_date'), account: val(accountLot, 'sold_date'), hasDelta: val(brokerLot, 'sold_date') !== val(accountLot, 'sold_date') },
    { label: 'Basis', broker: val(brokerLot, 'basis'), account: val(accountLot, 'basis'), hasDelta: val(brokerLot, 'basis') !== val(accountLot, 'basis') },
    { label: 'Proceeds', broker: val(brokerLot, 'proceeds'), account: val(accountLot, 'proceeds'), hasDelta: val(brokerLot, 'proceeds') !== val(accountLot, 'proceeds') },
    { label: 'Gain/Loss', broker: val(brokerLot, 'realized_gain'), account: val(accountLot, 'realized_gain'), hasDelta: val(brokerLot, 'realized_gain') !== val(accountLot, 'realized_gain') },
    { label: 'Wash Sale', broker: val(brokerLot, 'wash_sale_disallowed'), account: val(accountLot, 'wash_sale_disallowed'), hasDelta: val(brokerLot, 'wash_sale_disallowed') !== val(accountLot, 'wash_sale_disallowed') },
  ]

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-2 py-1.5 text-left">Field</th>
            <th className="px-2 py-1.5 text-right">Broker</th>
            <th className="px-2 py-1.5 text-right">Account</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.label} className={`border-b ${f.hasDelta ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}`}>
              <td className="px-2 py-1 font-medium">{f.label}</td>
              <td className="px-2 py-1 text-right tabular-nums">{f.broker}</td>
              <td className="px-2 py-1 text-right tabular-nums">{f.account}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
