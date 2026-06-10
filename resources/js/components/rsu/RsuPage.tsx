'use client'

import currency from 'currency.js'
import { BriefcaseBusiness, ExternalLink, LinkIcon, ReceiptText } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import Container from '@/components/container'
import type { CareerCompWorkflow } from '@/components/planning/CareerComp/types'
import { getShares, isVested, shareValue, todayIso } from '@/components/rsu/helpers'
import { RsuByAward } from '@/components/rsu/RsuByAward'
import { RsuByVestDate } from '@/components/rsu/RsuByVestDate'
import RsuChart from '@/components/rsu/RsuChart'
import RsuSubNav from '@/components/rsu/RsuSubNav'
import {
  firstPayslipHref,
  firstTransactionLink,
  hasBrokerageLink,
  hasPayslipLink,
  linkTypeLabel,
  needsRefundReconciliation,
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
import { hasPermission } from '@/lib/permissions'
import type { IAward, IRsuSettlementAllocation, RsuLinkType } from '@/types/finance'

interface RsuTransactionCandidate {
  id: number
  date?: string | null
  symbol?: string | null
  quantity?: string | number | null
  price?: string | number | null
  amount?: string | number | null
  description?: string | null
  confidence?: string | number | null
}

interface RsuPayslipCandidate {
  id: number
  pay_date?: string | null
  earnings_rsu?: string | number | null
  ps_rsu_tax_offset?: string | number | null
  ps_rsu_excess_refund?: string | number | null
  confidence?: string | number | null
}

interface RsuCandidateResponse {
  transactions?: RsuTransactionCandidate[]
  payslips?: RsuPayslipCandidate[]
}

interface FocusedAllocationChoice {
  key: string
  label: string
  allocationId: number | null
  equityAwardId: number | null
}

type RsuLinkTarget = 'transaction' | 'payslip'

const TRANSACTION_LINK_TYPES: RsuLinkType[] = ['share_deposit', 'sell_to_cover', 'withholding_cash', 'sale', 'excess_refund', 'other']
const PAYSLIP_LINK_TYPES: RsuLinkType[] = ['payslip_rsu_income', 'payslip_rsu_tax_offset', 'payslip_rsu_excess_refund']

export default function RsuPage() {
  const [loading, setLoading] = useState(true)
  const [rsu, setRsu] = useState<IAward[]>([])
  const [careerWorkflow, setCareerWorkflow] = useState<CareerCompWorkflow | null>(null)
  const [chartMode, setChartMode] = useState<'shares' | 'value'>('shares')
  const [filter, setFilter] = useState<RsuDashboardFilter>('actual')
  const canManageRsu = hasPermission('finance.rsu.manage')
  const canViewTransactions = hasPermission('finance.transactions.view')
  const canViewPayslips = hasPermission('finance.payslips.view')
  const canManagePayslips = hasPermission('finance.payslips.manage')
  const focusQuery = useMemo(() => {
    if (typeof window === 'undefined') return { settlementId: null, linkTarget: null, defaultLinkType: null }
    const params = new URLSearchParams(window.location.search)
    const settlementParam = params.get('settlement_id')
    const linkParam = params.get('link')
    const linkTarget = linkParam === 'transaction' || linkParam === 'payslip' ? linkParam as RsuLinkTarget : null
    return {
      settlementId: settlementParam ? Number(settlementParam) : null,
      linkTarget,
      defaultLinkType: linkTypeFromQuery(params.get('link_type'), linkTarget),
    }
  }, [])
  const loadRsuData = useCallback(() => {
    setLoading(true)
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

  useEffect(() => {
    loadRsuData()
  }, [loadRsuData])

  const now = todayIso()
  const virtualRsu = useMemo(() => virtualRefreshersFromCareerComp(careerWorkflow?.inputs), [careerWorkflow])
  const actualAndVirtual = useMemo(() => [...rsu, ...virtualRsu], [rsu, virtualRsu])
  const focusedAwards = useMemo(
    () => rsu.filter((award) => primarySettlement(award)?.id === focusQuery.settlementId),
    [focusQuery.settlementId, rsu],
  )
  const focusedSettlement = focusedAwards.length > 0 ? primarySettlement(focusedAwards[0]!) : null
  const focusedAllocationChoices = useMemo(
    () => settlementAllocationChoices(focusedAwards, focusQuery.settlementId),
    [focusedAwards, focusQuery.settlementId],
  )
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
      {focusQuery.settlementId && (
        <Card className="mb-4">
          <div className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-semibold">
                  {focusedSettlement ? settlementLabel(focusedSettlement) : `Settlement #${focusQuery.settlementId}`}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {focusedAwards.length > 0
                    ? `${focusedAwards.length} vest event${focusedAwards.length === 1 ? '' : 's'} highlighted below.`
                    : 'No loaded vest events reference this settlement.'}
                  {focusQuery.linkTarget ? ` Link target: ${focusQuery.linkTarget}.` : ''}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <a href="/finance/rsu">
                  Clear focus
                </a>
              </Button>
            </div>
            {focusQuery.linkTarget && (
              <RsuLinkWorkflow
                allocationChoices={focusedAllocationChoices}
                canManageRsu={canManageRsu}
                canViewPayslips={canViewPayslips}
                canViewTransactions={canViewTransactions}
                defaultLinkType={focusQuery.defaultLinkType}
                linkTarget={focusQuery.linkTarget}
                onLinked={loadRsuData}
                settlementId={focusQuery.settlementId}
              />
            )}
          </div>
        </Card>
      )}
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
                    const displayGrantValue = grantValue ?? (r.virtualValue != null ? currency(r.virtualValue) : null)
                    const settlement = primarySettlement(r)
                    const transactionLink = firstTransactionLink(r.rsu_links)
                    const transactionUrl = transactionLink ? transactionHref(transactionLink) : null
                    const payslipUrl = firstPayslipHref(r)
                    const refundReconciliationNeeded = needsRefundReconciliation(r)
                    const focused = settlement?.id === focusQuery.settlementId
                    return (
                      <TableRow key={r.isVirtual ? `virtual-${r.virtualYear}-${i}` : r.id ?? i} className={focused ? 'bg-primary/10' : vested && !r.isVirtual ? 'opacity-50 line-through' : r.isVirtual ? 'bg-muted/30' : ''}>
                        <TableCell>
                          {vested && !r.isVirtual && '✔ '}
                          {r.vest_date}
                          {r.isVirtual && <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">Projected</span>}
                        </TableCell>
                        <TableCell>{r.grant_date}</TableCell>
                        <TableCell>{shares != null ? Number(shares.toFixed(6)) : '—'}</TableCell>
                        <TableCell>{grantPrice != null ? currency(grantPrice).format() : ''}</TableCell>
                        <TableCell>{displayGrantValue ? displayGrantValue.format() : ''}</TableCell>
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
                                {refundReconciliationNeeded && <span className="text-destructive">Needs refund reconciliation</span>}
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
                                {settlement?.id && !transactionUrl && canViewTransactions && canManageRsu && (
                                  <Button asChild variant="outline" size="sm">
                                    <a href={settlementLinkHref(settlement.id, 'transaction')}>
                                      <LinkIcon className="h-3.5 w-3.5" />
                                      Transaction
                                    </a>
                                  </Button>
                                )}
                                {transactionUrl && canViewTransactions && (
                                  <Button asChild variant="outline" size="sm">
                                    <a href={transactionUrl}>
                                      <ExternalLink className="h-3.5 w-3.5" />
                                      Transaction
                                    </a>
                                  </Button>
                                )}
                                {settlement?.id && (!payslipUrl || refundReconciliationNeeded) && canViewPayslips && canManageRsu && (
                                  <Button asChild variant="outline" size="sm">
                                    <a href={settlementLinkHref(settlement.id, 'payslip', refundReconciliationNeeded ? 'payslip_rsu_excess_refund' : undefined)}>
                                      <ReceiptText className="h-3.5 w-3.5" />
                                      {refundReconciliationNeeded ? 'Refund payslip' : 'Payslip'}
                                    </a>
                                  </Button>
                                )}
                                {payslipUrl && canManagePayslips && (
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

function settlementAllocationChoices(awards: IAward[], settlementId: number | null): FocusedAllocationChoice[] {
  if (!settlementId) return []

  return awards.flatMap((award) => (
    award.settlement_allocations
      ?.filter((allocation) => allocation.settlement?.id === settlementId)
      .map((allocation, index) => allocationChoice(award, allocation, index)) ?? []
  ))
}

function allocationChoice(award: IAward, allocation: IRsuSettlementAllocation, index: number): FocusedAllocationChoice {
  const allocationId = allocation.id ?? null
  const equityAwardId = allocation.equity_award_id ?? award.id ?? null
  const key = allocationId ? `allocation-${allocationId}` : `award-${equityAwardId ?? index}`
  const labelParts = [award.award_id ?? `Award ${equityAwardId ?? index + 1}`, award.vest_date].filter(Boolean)

  return {
    key,
    label: labelParts.join(' - '),
    allocationId,
    equityAwardId,
  }
}

function defaultLinkTypeForTarget(linkTarget: RsuLinkTarget): RsuLinkType {
  return linkTarget === 'transaction' ? 'share_deposit' : 'payslip_rsu_income'
}

function linkTypeFromQuery(value: string | null, linkTarget: RsuLinkTarget | null): RsuLinkType | null {
  if (!value || !linkTarget) return null
  const options = linkTarget === 'transaction' ? TRANSACTION_LINK_TYPES : PAYSLIP_LINK_TYPES

  return options.includes(value as RsuLinkType) ? value as RsuLinkType : null
}

function RsuLinkWorkflow({
  allocationChoices,
  canManageRsu,
  canViewPayslips,
  canViewTransactions,
  defaultLinkType,
  linkTarget,
  onLinked,
  settlementId,
}: {
  allocationChoices: FocusedAllocationChoice[]
  canManageRsu: boolean
  canViewPayslips: boolean
  canViewTransactions: boolean
  defaultLinkType?: RsuLinkType | null
  linkTarget: RsuLinkTarget
  onLinked: () => void
  settlementId: number
}) {
  const canViewSource = linkTarget === 'transaction' ? canViewTransactions : canViewPayslips
  const [candidates, setCandidates] = useState<RsuCandidateResponse>({})
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedCandidateKey, setSelectedCandidateKey] = useState('')
  const [selectedAllocationKey, setSelectedAllocationKey] = useState('settlement')
  const [linkType, setLinkType] = useState<RsuLinkType>(defaultLinkType ?? defaultLinkTypeForTarget(linkTarget))

  useEffect(() => {
    setCandidates({})
    setMessage(null)
    setSelectedCandidateKey('')
    setSelectedAllocationKey('settlement')
    setLinkType(defaultLinkType ?? defaultLinkTypeForTarget(linkTarget))

    if (!canViewSource) return

    let cancelled = false
    setLoading(true)
    setFailed(false)
    fetchWrapper
      .get(`/api/rsu/settlements/${settlementId}/candidates`)
      .then((response) => {
        if (!cancelled) setCandidates(normalizeCandidates(response))
      })
      .catch((error) => {
        console.error('Failed to fetch RSU settlement candidates', error)
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [canViewSource, defaultLinkType, linkTarget, settlementId])

  const rows = linkTarget === 'transaction' ? candidates.transactions ?? [] : candidates.payslips ?? []
  const selectedCandidate = rows.find((candidate) => candidateKey(linkTarget, candidate.id) === selectedCandidateKey) ?? rows[0] ?? null
  const effectiveCandidateKey = selectedCandidate ? candidateKey(linkTarget, selectedCandidate.id) : ''
  const linkTypeOptions = linkTarget === 'transaction' ? TRANSACTION_LINK_TYPES : PAYSLIP_LINK_TYPES
  const selectedAllocation = allocationChoices.find((choice) => choice.key === selectedAllocationKey) ?? null
  const linkTargetCount = selectedAllocation ? 1 : Math.max(1, allocationChoices.length)

  useEffect(() => {
    if (!selectedCandidateKey && rows[0]) {
      setSelectedCandidateKey(candidateKey(linkTarget, rows[0].id))
    }
  }, [linkTarget, rows, selectedCandidateKey])

  useEffect(() => {
    if (
      selectedAllocationKey !== 'settlement'
      && !allocationChoices.some((choice) => choice.key === selectedAllocationKey)
    ) {
      setSelectedAllocationKey('settlement')
    }
  }, [allocationChoices, selectedAllocationKey])

  const createLink = async () => {
    if (!selectedCandidate) return

    const targetAllocations = selectedAllocation
      ? [selectedAllocation]
      : allocationChoices.length > 0 ? allocationChoices : [null]

    const basePayload: Record<string, unknown> = {
      link_type: linkType,
      status: 'confirmed',
      confidence: numericValue(selectedCandidate.confidence),
      confidence_reasons: [`Selected from RSU ${linkTarget} candidates UI`],
    }

    if (linkTarget === 'transaction') {
      basePayload.transaction_id = selectedCandidate.id
    } else {
      basePayload.payslip_id = selectedCandidate.id
    }

    setSaving(true)
    setMessage(null)
    try {
      await Promise.all(targetAllocations.map((allocation) => {
        const payload = { ...basePayload }
        if (allocation?.allocationId) payload.settlement_allocation_id = allocation.allocationId
        if (allocation?.equityAwardId) payload.equity_award_id = allocation.equityAwardId

        return fetchWrapper.post(`/api/rsu/settlements/${settlementId}/links`, payload)
      }))
      setMessage(linkTargetCount === 1 ? 'RSU link created.' : `RSU links created for ${linkTargetCount} awards.`)
      onLinked()
    } catch (error) {
      console.error('Failed to create RSU settlement link', error)
      setMessage('RSU link could not be created.')
    } finally {
      setSaving(false)
    }
  }

  if (!canManageRsu) {
    return <p className="mt-3 text-sm text-muted-foreground">RSU manage access is required to create settlement links.</p>
  }

  if (!canViewSource) {
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        {linkTarget === 'transaction' ? 'Transaction access is required to link settlement transactions.' : 'Payslip access is required to link settlement payslips.'}
      </p>
    )
  }

  return (
    <div className="mt-4 rounded-md border border-border p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">
          {linkTarget === 'transaction' ? 'Link a transaction candidate' : 'Link a payslip candidate'}
        </h4>
        {loading && <Spinner size="small" className="h-4 w-4" />}
      </div>
      {failed && <p className="text-sm text-destructive">Candidates could not be loaded.</p>}
      {!failed && !loading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No {linkTarget} candidates found for this settlement.</p>
      )}
      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="grid gap-2">
            {rows.map((candidate) => (
              <label key={candidateKey(linkTarget, candidate.id)} className="flex cursor-pointer items-start gap-3 rounded-md border border-muted p-3 text-sm">
                <input
                  type="radio"
                  className="mt-1"
                  checked={effectiveCandidateKey === candidateKey(linkTarget, candidate.id)}
                  onChange={() => setSelectedCandidateKey(candidateKey(linkTarget, candidate.id))}
                />
                {linkTarget === 'transaction'
                  ? <TransactionCandidateRow candidate={candidate as RsuTransactionCandidate} />
                  : <PayslipCandidateRow candidate={candidate as RsuPayslipCandidate} />}
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Link type
              <select className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground" value={linkType} onChange={(event) => setLinkType(event.target.value as RsuLinkType)}>
                {linkTypeOptions.map((option) => (
                  <option key={option} value={option}>{linkTypeLabel(option)}</option>
                ))}
              </select>
            </label>
            {allocationChoices.length > 0 && (
              <label className="grid gap-1 text-xs font-medium text-muted-foreground sm:col-span-2">
                Apply to
                <select className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground" value={selectedAllocationKey} onChange={(event) => setSelectedAllocationKey(event.target.value)}>
                  <option value="settlement">All settlement awards</option>
                  {allocationChoices.map((choice) => (
                    <option key={choice.key} value={choice.key}>{choice.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" disabled={saving || !selectedCandidate} onClick={createLink}>
              <LinkIcon className="h-3.5 w-3.5" />
              {saving ? 'Creating...' : 'Create RSU link'}
            </Button>
            {message && <span className={message.includes('could not') ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{message}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function normalizeCandidates(response: unknown): RsuCandidateResponse {
  if (!response || typeof response !== 'object') return {}
  const data = response as RsuCandidateResponse

  return {
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    payslips: Array.isArray(data.payslips) ? data.payslips : [],
  }
}

function candidateKey(target: RsuLinkTarget, id: number): string {
  return `${target}:${id}`
}

function numericValue(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)

  return Number.isFinite(numeric) ? numeric : null
}

function formatCandidateMoney(value: string | number | null | undefined): string {
  const numeric = numericValue(value)

  return numeric === null ? '-' : currency(numeric).format()
}

function formatCandidateNumber(value: string | number | null | undefined): string {
  const numeric = numericValue(value)

  return numeric === null ? '-' : String(Number(numeric.toFixed(6)))
}

function TransactionCandidateRow({ candidate }: { candidate: RsuTransactionCandidate }) {
  return (
    <span className="grid flex-1 gap-1">
      <span className="font-medium">{candidate.date ?? 'Unknown date'} - {candidate.description ?? candidate.symbol ?? `Transaction #${candidate.id}`}</span>
      <span className="text-xs text-muted-foreground">
        {candidate.symbol ?? 'No symbol'} · Qty {formatCandidateNumber(candidate.quantity)} · Price {formatCandidateMoney(candidate.price)} · Amount {formatCandidateMoney(candidate.amount)} · Confidence {formatCandidateNumber(candidate.confidence)}
      </span>
    </span>
  )
}

function PayslipCandidateRow({ candidate }: { candidate: RsuPayslipCandidate }) {
  return (
    <span className="grid flex-1 gap-1">
      <span className="font-medium">{candidate.pay_date ?? 'Unknown pay date'} - Payslip #{candidate.id}</span>
      <span className="text-xs text-muted-foreground">
        Income {formatCandidateMoney(candidate.earnings_rsu)} · Tax offset {formatCandidateMoney(candidate.ps_rsu_tax_offset)} · Refund {formatCandidateMoney(candidate.ps_rsu_excess_refund)} · Confidence {formatCandidateNumber(candidate.confidence)}
      </span>
    </span>
  )
}
