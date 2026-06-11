'use client'

import currency from 'currency.js'
import { ExternalLink, LinkIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { fetchWrapper } from '@/fetchWrapper'
import { hasPermission } from '@/lib/permissions'
import type { IRsuLink, IRsuSettlement } from '@/types/finance'

import { linkTypeLabel, reconciliationRows, settlementHref, settlementLabel } from './rsuUiHelpers'

interface RsuReciprocalLinksPanelProps {
  endpoint: string | null
  title?: string
  compact?: boolean
  localRsuIncome?: number | string | null
  localTaxOffset?: number | string | null
  localExcessRefund?: number | string | null
}

export default function RsuReciprocalLinksPanel({
  endpoint,
  title = 'RSU links',
  compact = false,
  localRsuIncome,
  localTaxOffset,
  localExcessRefund,
}: RsuReciprocalLinksPanelProps) {
  const canViewRsu = hasPermission('finance.rsu.view')
  const [links, setLinks] = useState<IRsuLink[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!endpoint || !canViewRsu) {
      setLinks([])
      return
    }

    let cancelled = false
    setLoading(true)
    setFailed(false)
    fetchWrapper
      .get(endpoint)
      .then((response) => {
        if (!cancelled) setLinks(Array.isArray(response) ? response : [])
      })
      .catch((error) => {
        console.error('Failed to fetch RSU links', error)
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [canViewRsu, endpoint])

  if (!endpoint || !canViewRsu) return null

  const localRows = [
    localComparisonRow('Payslip RSU income', localRsuIncome, expectedSettlementTotal(links, ['payslip_rsu_income'], 'gross_income')),
    localComparisonRow('Payslip RSU tax offset', localTaxOffset, expectedSettlementTotal(links, ['payslip_rsu_tax_offset'], 'actual_tax_remitted')),
    localComparisonRow('Payslip excess refund', localExcessRefund, expectedSettlementTotal(links, ['payslip_rsu_excess_refund'], 'excess_refund')),
  ].filter((row): row is LocalComparisonRow => row !== null)

  return (
    <div className={compact ? 'rounded-md border border-border p-3' : 'border border-border rounded-sm bg-card'}>
      <div className={compact ? 'mb-2 flex items-center justify-between' : 'px-4 py-2.5 border-b border-border flex items-center justify-between'}>
        <h3 className={compact ? 'text-sm font-semibold' : 'font-mono text-[10px] font-semibold uppercase tracking-widest text-primary'}>
          {title}
        </h3>
        {loading && <Spinner size="small" className="h-4 w-4" />}
      </div>
      <div className={compact ? 'space-y-3 text-sm' : 'p-4 space-y-3'}>
        {failed && <p className="text-xs text-destructive">RSU links could not be loaded.</p>}
        {!failed && !loading && links.length === 0 && localRows.length === 0 && (
          <p className="text-xs text-muted-foreground">No RSU settlement links.</p>
        )}
        {localRows.length > 0 && (
          <div className="grid grid-cols-4 gap-x-3 gap-y-1 text-xs">
            {localRows.map((row) => (
              <div key={row.label} className="contents">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="text-right font-medium">{row.actualLabel}</span>
                <span className="text-right text-muted-foreground">{row.expectedLabel}</span>
                <span className={`text-right ${row.delta !== null && row.delta !== 0 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
                  {row.deltaLabel}
                </span>
              </div>
            ))}
          </div>
        )}
        {links.map((link) => {
          const settlement = link.settlement ?? null
          return (
            <div key={link.id} className="rounded-md border border-muted p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-sm font-medium">
                      <LinkIcon className="h-3.5 w-3.5" />
                      {linkTypeLabel(link.link_type)}
                    </span>
                    {link.status && <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{link.status}</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{settlementLabel(settlement)}</p>
                </div>
                {settlement?.id && (
                  <Button asChild variant="outline" size="sm">
                    <a href={settlementHref(settlement.id)}>
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      RSU
                    </a>
                  </Button>
                )}
              </div>
              {settlement && reconciliationRows(settlement).length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-2 text-xs">
                  {reconciliationRows(settlement).map((row) => (
                    <div key={row.label} className="contents">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="text-right">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface LocalComparisonRow {
  label: string
  actualLabel: string
  expectedLabel: string
  delta: number | null
  deltaLabel: string
}

function localComparisonRow(label: string, actualValue: number | string | null | undefined, expectedValue: number | null): LocalComparisonRow | null {
  const actual = Number(actualValue)
  if (actualValue === null || actualValue === undefined || !Number.isFinite(actual) || actual === 0) return null

  const delta = expectedValue === null ? null : currency(actual).subtract(expectedValue).value

  return {
    label,
    actualLabel: `Actual ${currency(actual).format()}`,
    expectedLabel: expectedValue === null ? 'Expected -' : `Expected ${currency(expectedValue).format()}`,
    delta,
    deltaLabel: delta === null ? 'Delta -' : `Delta ${formatSignedMoney(delta)}`,
  }
}

function expectedSettlementTotal(
  links: IRsuLink[],
  linkTypes: IRsuLink['link_type'][],
  field: keyof Pick<IRsuSettlement, 'gross_income' | 'actual_tax_remitted' | 'excess_refund'>,
): number | null {
  let total = currency(0)
  let found = false
  const seen = new Set<string>()

  for (const link of links) {
    if (!linkTypes.includes(link.link_type)) continue
    const settlement = link.settlement
    if (!settlement?.id) continue

    const key = `${settlement.id}:${link.link_type}:${link.payslip_id ?? 'none'}`
    if (seen.has(key)) continue
    seen.add(key)

    const value = settlement[field]
    if (value === null || value === undefined) continue

    total = total.add(Number(value))
    found = true
  }

  return found ? total.value : null
}

function formatSignedMoney(value: number): string {
  const formatted = currency(Math.abs(value)).format()

  return value < 0 ? `-${formatted}` : `+${formatted}`
}
