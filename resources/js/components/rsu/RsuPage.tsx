'use client'

import currency from 'currency.js'
import { BriefcaseBusiness, ExternalLink, LinkIcon, ReceiptText } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import Container from '@/components/container'
import type { CareerCompWorkflow } from '@/components/planning/CareerComp/types'
import { getShares, isVested, shareValue, todayIso } from '@/components/rsu/helpers'
import { RsuByAward } from '@/components/rsu/RsuByAward'
import { RsuByVestDate } from '@/components/rsu/RsuByVestDate'
import RsuChart from '@/components/rsu/RsuChart'
import RsuSubNav from '@/components/rsu/RsuSubNav'
import {
  firstPayslipLink,
  firstTransactionLink,
  hasBrokerageLink,
  hasPayslipLink,
  needsRefundReconciliation,
  payslipHref,
  primarySettlement,
  type RsuDashboardFilter,
  settlementHref,
  settlementLabel,
  settlementLinkHref,
  transactionHref,
  virtualRefreshersFromCareerComp,
} from '@/components/rsu/rsuUiHelpers'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchWrapper } from '@/fetchWrapper'
import type { IAward } from '@/types/finance'

export default function RsuPage() {
  const [loading, setLoading] = useState(true)
  const [rsu, setRsu] = useState<IAward[]>([])
  const [careerWorkflow, setCareerWorkflow] = useState<CareerCompWorkflow | null>(null)
  const [chartMode, setChartMode] = useState<'shares' | 'value'>('shares')
  const [filter, setFilter] = useState<RsuDashboardFilter>('actual')
  useEffect(() => {
    Promise.all([
      fetchWrapper.get('/api/rsu'),
      fetchWrapper.get('/api/financial-planning/career-comparison/latest').catch(() => ({ workflow: null })),
    ])
      .then(([rsuResponse, workflowResponse]) => {
        setRsu(Array.isArray(rsuResponse) ? rsuResponse : [])
        setCareerWorkflow(workflowResponse?.workflow ?? null)
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  const now = todayIso()
  const virtualRsu = useMemo(() => virtualRefreshersFromCareerComp(careerWorkflow?.inputs), [careerWorkflow])
  const actualAndVirtual = useMemo(() => [...rsu, ...virtualRsu], [rsu, virtualRsu])
  const filteredRsu = useMemo(() => {
    const rows = filter === 'actual-and-virtual' ? actualAndVirtual : rsu
    if (filter === 'unvested') return rsu.filter((r) => !isVested(r, now))
    if (filter === 'missing-price') return rsu.filter((r) => r.vest_price == null)
    if (filter === 'missing-settlement') return rsu.filter((r) => !r.settlement_allocations?.length)
    if (filter === 'missing-brokerage-link') return rsu.filter((r) => !hasBrokerageLink(r))
    if (filter === 'missing-payslip-link') return rsu.filter((r) => !hasPayslipLink(r))
    if (filter === 'needs-refund-reconciliation') return rsu.filter((r) => needsRefundReconciliation(r))
    return rows
  }, [actualAndVirtual, filter, now, rsu])

  const filterButtons: { value: RsuDashboardFilter; label: string }[] = [
    { value: 'actual', label: 'Actual only' },
    { value: 'actual-and-virtual', label: 'Actual + virtual current-job refreshers' },
    { value: 'unvested', label: 'Only unvested' },
    { value: 'missing-price', label: 'Missing vest price' },
    { value: 'missing-settlement', label: 'Missing settlement' },
    { value: 'missing-brokerage-link', label: 'Missing brokerage link' },
    { value: 'missing-payslip-link', label: 'Missing payslip link' },
    { value: 'needs-refund-reconciliation', label: 'Needs refund reconciliation' },
  ]

  return (
    <Container>
      <RsuSubNav />
      <div className="mb-8">
        <Tabs defaultValue={chartMode} onValueChange={(v) => setChartMode(v as 'shares' | 'value')} className="mb-2">
          <TabsList>
            <TabsTrigger value="shares">Share count</TabsTrigger>
            <TabsTrigger value="value">Value</TabsTrigger>
          </TabsList>
        </Tabs>
        <RsuChart rsu={rsu} mode={chartMode} />
      </div>
      <Tabs defaultValue="all-vests">
        <div className="mb-4 flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="all-vests">All vests</TabsTrigger>
            <TabsTrigger value="per-vest-date">Per vest date</TabsTrigger>
            <TabsTrigger value="per-award">Per award</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {filterButtons.map((button) => (
              <button
                key={button.value}
                className={filter === button.value ? 'font-semibold' : 'text-muted-foreground'}
                onClick={() => setFilter(button.value)}
              >
                {button.label}
              </button>
            ))}
          </div>
        </div>
        <TabsContent value="all-vests">
          <Card className="mb-8">
            <div className="p-6">
              <h3 className="text-xl font-semibold mb-4">All vests</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vest date</TableHead>
                    <TableHead>Granted on</TableHead>
                    <TableHead>Shares</TableHead>
                    <TableHead>Grant price</TableHead>
                    <TableHead>Grant value</TableHead>
                    <TableHead style={{ borderLeft: '2px solid #e5e7eb' }}>Vest price</TableHead>
                    <TableHead>Total value at vest</TableHead>
                    <TableHead>Grant ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRsu.map((r, i) => {
                    const vested = isVested(r, now)
                    const shares = getShares(r)
                    const price = r.vest_price ?? null
                    const total = shareValue(shares, price)
                    const grantPrice = r.grant_price ?? null
                    const grantValue = shareValue(shares, grantPrice)
                    const settlement = primarySettlement(r)
                    const transactionLink = firstTransactionLink(r.rsu_links)
                    const transactionUrl = transactionLink ? transactionHref(transactionLink) : null
                    const payslipLink = firstPayslipLink(r.rsu_links)
                    const payslipUrl = payslipHref(payslipLink?.payslip_id)
                    return (
                      <TableRow key={r.isVirtual ? `virtual-${r.virtualYear}-${i}` : r.id ?? i} className={vested && !r.isVirtual ? 'opacity-50 line-through' : r.isVirtual ? 'bg-muted/30' : ''}>
                        <TableCell>
                          {vested && !r.isVirtual && '✔ '}
                          {r.vest_date}
                          {r.isVirtual && <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">Projected</span>}
                        </TableCell>
                        <TableCell>{r.grant_date}</TableCell>
                        <TableCell>{shares != null ? Number(shares.toFixed(6)) : '—'}</TableCell>
                        <TableCell>{grantPrice != null ? currency(grantPrice).format() : ''}</TableCell>
                        <TableCell>{r.virtualValue != null ? currency(r.virtualValue).format() : grantValue ? grantValue.format() : ''}</TableCell>
                        <TableCell style={{ borderLeft: '2px solid #e5e7eb' }}>
                          {price != null ? currency(price).format() : ''}
                        </TableCell>
                        <TableCell>{total ? total.format() : ''}</TableCell>
                        <TableCell>{r.award_id}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-xs">
                            {r.isVirtual ? (
                              <>
                                <span>Virtual refresher projection</span>
                                <span>{r.virtualSourceLabel}</span>
                              </>
                            ) : (
                              <>
                                <span>{r.vest_price_source === 'quote_close' ? 'Quote-derived price' : r.vest_price_source ?? 'Price source missing'}</span>
                                <span>{settlementLabel(settlement)}</span>
                                <span>{hasBrokerageLink(r) ? 'Brokerage linked' : 'Missing brokerage link'}</span>
                                <span>{hasPayslipLink(r) ? 'Payslip linked' : 'Missing payslip link'}</span>
                                {needsRefundReconciliation(r) && <span className="text-destructive">Needs refund reconciliation</span>}
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {r.isVirtual ? (
                              <Button asChild variant="outline" size="sm">
                                <a href="/financial-planning/career-comparison">
                                  <BriefcaseBusiness className="h-3.5 w-3.5" />
                                  Career
                                </a>
                              </Button>
                            ) : (
                              <>
                                {settlement?.id && (
                                  <Button asChild variant="outline" size="sm">
                                    <a href={settlementHref(settlement.id)}>
                                      <ExternalLink className="h-3.5 w-3.5" />
                                      Settlement
                                    </a>
                                  </Button>
                                )}
                                {settlement?.id && !transactionUrl && (
                                  <Button asChild variant="outline" size="sm">
                                    <a href={settlementLinkHref(settlement.id, 'transaction')}>
                                      <LinkIcon className="h-3.5 w-3.5" />
                                      Transaction
                                    </a>
                                  </Button>
                                )}
                                {transactionUrl && (
                                  <Button asChild variant="outline" size="sm">
                                    <a href={transactionUrl}>
                                      <ExternalLink className="h-3.5 w-3.5" />
                                      Transaction
                                    </a>
                                  </Button>
                                )}
                                {settlement?.id && !payslipUrl && (
                                  <Button asChild variant="outline" size="sm">
                                    <a href={settlementLinkHref(settlement.id, 'payslip')}>
                                      <ReceiptText className="h-3.5 w-3.5" />
                                      Payslip
                                    </a>
                                  </Button>
                                )}
                                {payslipUrl && (
                                  <Button asChild variant="outline" size="sm">
                                    <a href={payslipUrl}>
                                      <ExternalLink className="h-3.5 w-3.5" />
                                      Payslip
                                    </a>
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {loading && (
                <div className="flex justify-center py-4">
                  <Spinner />
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="per-vest-date">
          <Card className="mb-8">
            <div className="p-6">
              <h3 className="text-xl font-semibold mb-4">Per vest date</h3>
              <RsuByVestDate rsu={filteredRsu} />
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="per-award">
          <Card className="mb-8">
            <div className="p-6">
              <h3 className="text-xl font-semibold mb-4">Per award</h3>
              <RsuByAward rsu={filteredRsu} hideFullyVested={filter === 'unvested'} />
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </Container>
  )
}
