'use client'

import currency from 'currency.js'
import { ExternalLink, LinkIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { fetchWrapper } from '@/fetchWrapper'
import type { IRsuLink } from '@/types/finance'

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
  const [links, setLinks] = useState<IRsuLink[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!endpoint) {
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
  }, [endpoint])

  if (!endpoint) return null

  const localRows = [
    ['Payslip RSU income', localRsuIncome],
    ['Payslip RSU tax offset', localTaxOffset],
    ['Payslip excess refund', localExcessRefund],
  ]
    .filter(([, value]) => value !== null && value !== undefined && Number(value) !== 0)
    .map(([label, value]) => ({ label: String(label), value: currency(Number(value)).format() }))

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
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {localRows.map((row) => (
              <div key={row.label} className="contents">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="text-right font-medium">{row.value}</span>
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
