import { Filter, RotateCcw } from 'lucide-react'
import React from 'react'

import { Button } from '@/components/ui/button'

export interface LotFilterValues {
  status: 'all' | 'open' | 'closed'
  source: string
  reconciliationState: string
  symbol: string
  cusip: string
  dateFrom: string
  dateTo: string
}

interface LotFiltersProps {
  value: LotFilterValues
  onChange: (value: LotFilterValues) => void
  onReset?: () => void
  className?: string
}

const SOURCES = [
  { value: '', label: 'Any source' },
  { value: 'broker_1099b', label: '1099-B' },
  { value: 'account_derived', label: 'Account' },
  { value: 'manual', label: 'Manual' },
  { value: 'synthetic_adjustment', label: 'Adjustment' },
]

const RECONCILIATION_STATES = [
  { value: '', label: 'Any state' },
  { value: 'none', label: 'No link' },
  { value: 'auto_matched', label: 'Auto matched' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'accepted_broker', label: 'Broker accepted' },
  { value: 'accepted_account_override', label: 'Account override' },
  { value: 'ignored_duplicate', label: 'Duplicate' },
  { value: 'unlinked', label: 'Unlinked' },
  { value: 'broker_only', label: 'Broker-only' },
  { value: 'account_only', label: 'Account-only' },
]

function fieldClassName(): string {
  return 'h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
}

export function LotFilters({ value, onChange, onReset, className = '' }: LotFiltersProps): React.ReactElement {
  const update = <Key extends keyof LotFilterValues>(key: Key, nextValue: LotFilterValues[Key]): void => {
    onChange({ ...value, [key]: nextValue })
  }

  return (
    <div className={`flex flex-wrap items-end gap-2 ${className}`}>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Status
        <select className={fieldClassName()} value={value.status} onChange={(event) => update('status', event.target.value as LotFilterValues['status'])}>
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Source
        <select className={fieldClassName()} value={value.source} onChange={(event) => update('source', event.target.value)}>
          {SOURCES.map((source) => (
            <option key={source.value} value={source.value}>{source.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        State
        <select className={fieldClassName()} value={value.reconciliationState} onChange={(event) => update('reconciliationState', event.target.value)}>
          {RECONCILIATION_STATES.map((state) => (
            <option key={state.value} value={state.value}>{state.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Symbol
        <input className={`${fieldClassName()} w-28`} value={value.symbol} onChange={(event) => update('symbol', event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        CUSIP
        <input className={`${fieldClassName()} w-32`} value={value.cusip} onChange={(event) => update('cusip', event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        From
        <input className={fieldClassName()} type="date" value={value.dateFrom} onChange={(event) => update('dateFrom', event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        To
        <input className={fieldClassName()} type="date" value={value.dateTo} onChange={(event) => update('dateTo', event.target.value)} />
      </label>
      <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={!onReset} onClick={onReset}>
        {onReset ? <RotateCcw className="h-3.5 w-3.5" /> : <Filter className="h-3.5 w-3.5" />}
        Reset
      </Button>
    </div>
  )
}
