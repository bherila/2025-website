import currency from 'currency.js'

import type { CareerCompInputs, JobSpec, VestingFrequency } from '@/components/planning/CareerComp/types'
import type { IAward, IRsuLink, IRsuSettlement, IRsuSettlementAllocation, RsuLinkType } from '@/types/finance'

export type RsuDashboardFilter =
  | 'actual'
  | 'actual-and-virtual'
  | 'unvested'
  | 'missing-price'
  | 'missing-settlement'
  | 'missing-brokerage-link'
  | 'missing-payslip-link'
  | 'needs-refund-reconciliation'

export function linkTypeLabel(type: RsuLinkType | string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function settlementHref(settlementId: number): string {
  return `/finance/rsu?settlement_id=${settlementId}`
}

export function settlementLinkHref(settlementId: number, target: 'transaction' | 'payslip'): string {
  return `/finance/rsu?settlement_id=${settlementId}&link=${target}`
}

export function transactionHref(link: Pick<IRsuLink, 'transaction_id' | 'account_id'>): string | null {
  if (!link.transaction_id) return null
  const base = link.account_id ? `/finance/account/${link.account_id}/transactions` : '/finance/account/all/transactions'
  return `${base}#t_id=${link.transaction_id}`
}

export function payslipHref(payslipId: number | null | undefined): string | null {
  return payslipId ? `/finance/payslips/entry?id=${payslipId}` : null
}

export function primarySettlement(award: Pick<IAward, 'settlement_allocations'>): IRsuSettlement | null {
  return award.settlement_allocations?.find((allocation) => allocation.settlement)?.settlement ?? null
}

export function hasBrokerageLink(award: Pick<IAward, 'rsu_links' | 'settlement_allocations'>): boolean {
  return Boolean(
    primarySettlement(award)?.brokerage_account_id
    || award.rsu_links?.some((link) => link.transaction_id || link.lot_id || link.account_id),
  )
}

export function hasPayslipLink(award: Pick<IAward, 'rsu_links' | 'settlement_allocations'>): boolean {
  const settlement = primarySettlement(award)
  return Boolean(
    settlement?.payslip_id
    || settlement?.refund_payslip_id
    || award.rsu_links?.some((link) => link.payslip_id),
  )
}

export function needsRefundReconciliation(award: Pick<IAward, 'settlement_allocations' | 'rsu_links'>): boolean {
  const settlement = primarySettlement(award)
  if (!settlement) return false
  const excessRefund = Number(settlement.excess_refund ?? 0)
  if (excessRefund <= 0) return false
  const linkedRefund = award.rsu_links?.some((link) => (
    link.link_type === 'excess_refund'
    || (link.link_type === 'payslip_rsu_excess_refund' && link.payslip_id)
  ))
  return !linkedRefund && !settlement.refund_payslip_id
}

export function firstTransactionLink(links: IRsuLink[] | undefined): IRsuLink | null {
  return links?.find((link) => transactionHref(link)) ?? null
}

export function firstPayslipLink(links: IRsuLink[] | undefined): IRsuLink | null {
  return links?.find((link) => link.payslip_id) ?? null
}

export function firstPayslipHref(award: Pick<IAward, 'rsu_links' | 'settlement_allocations'>): string | null {
  const link = firstPayslipLink(award.rsu_links)
  const settlement = primarySettlement(award)
  return payslipHref(link?.payslip_id ?? settlement?.payslip_id ?? settlement?.refund_payslip_id)
}

export function settlementLabel(settlement: IRsuSettlement | null | undefined): string {
  if (!settlement) return 'Missing settlement'
  const status = settlement.status ? `${settlement.status.charAt(0).toUpperCase()}${settlement.status.slice(1)}` : 'Settlement'
  return `${status} #${settlement.id}`
}

export function reconciliationRows(
  settlement: IRsuSettlement,
  allocation?: IRsuSettlementAllocation | null,
): { label: string; value: string }[] {
  return [
    ['RSU income', allocation?.gross_income ?? settlement.gross_income],
    ['Withheld value', allocation?.allocated_withheld_value ?? settlement.withheld_value],
    ['Actual tax remitted', allocation?.allocated_tax_remitted ?? settlement.actual_tax_remitted],
    ['Excess refund', allocation?.allocated_excess_refund ?? settlement.excess_refund],
  ]
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([label, value]) => ({ label: String(label), value: currency(Number(value)).format() }))
}

export function virtualRefreshersFromCareerComp(inputs: CareerCompInputs | null | undefined): IAward[] {
  if (!inputs?.currentJobs?.length) return []

  const rows: IAward[] = []
  for (const job of inputs.currentJobs) {
    rows.push(...virtualRefreshersForJob(job, inputs.startYear, inputs.horizonYears))
  }
  return rows
}

function virtualRefreshersForJob(job: JobSpec, startYear: number, horizonYears: number): IAward[] {
  if (!job.grantTypes.rsu || job.refresher.pctOfBase <= 0) return []

  const cadence = Math.max(1, Math.round(job.refresher.cadenceYears))
  const firstOffset = Math.max(0, Math.round(job.refresher.firstYearOffset))
  const sharePrice = Math.max(0, Number(job.company.currentSharePrice ?? 0))
  const rows: IAward[] = []

  for (let offset = firstOffset; offset < horizonYears; offset += cadence) {
    const year = startYear + offset
    const raiseFactor = (1 + (job.comp.annualRaisePct / 100)) ** offset
    const targetValue = currency(job.comp.baseSalary).multiply(raiseFactor).multiply(job.refresher.pctOfBase / 100).value
    const shareCount = sharePrice > 0 ? currency(targetValue).divide(sharePrice).value : undefined
    const vestEvents = shareCount !== undefined
      ? linearVestingEvents(shareCount, `${year}-01-01`, job.refresher.vestingYears, job.refresher.cliffMonths, job.refresher.vestingFrequency)
      : [{ vestDate: `${year}-01-01`, shareCount: undefined }]
    const symbol = job.rsuGrants.find((grant) => grant.symbol)?.symbol
    vestEvents.forEach((event, eventIndex) => {
      const row: IAward = {
        id: -Number(`${year}${rows.length}${eventIndex}`),
        award_id: `Projected refresher ${year}`,
        grant_date: `${year}-01-01`,
        vest_date: event.vestDate,
        grant_price: sharePrice > 0 ? sharePrice : null,
        grant_price_source: null,
        vest_price: null,
        vest_price_source: null,
        settlement_allocations: [],
        rsu_links: [],
        isVirtual: true,
        virtualKind: 'current_job_refresher',
        virtualYear: year,
        virtualValue: targetValue,
        virtualSourceLabel: `${job.name} Career Comparison current job`,
      }
      if (event.shareCount !== undefined) row.share_count = event.shareCount
      if (symbol) row.symbol = symbol
      rows.push(row)
    })
  }

  return rows
}

function linearVestingEvents(
  shareCount: number,
  grantDate: string,
  vestingYears: number,
  cliffMonths: number,
  frequency: VestingFrequency,
): { vestDate: string; shareCount: number }[] {
  const vestingMonths = Math.max(0, Math.round(vestingYears * 12))
  const normalizedCliffMonths = Math.max(0, Math.round(cliffMonths))
  if (shareCount <= 0 || vestingMonths <= 0 || normalizedCliffMonths > vestingMonths) return []

  const frequencyMonths = frequency === 'annual' ? 12 : frequency === 'quarterly' ? 3 : 1
  const monthlyShares = shareCount / vestingMonths
  const events: { vestDate: string; shareCount: number }[] = []
  let monthsAccrued = 0

  for (let month = 1; month <= vestingMonths; month += 1) {
    monthsAccrued += 1
    if (month < normalizedCliffMonths) continue

    const isVestEvent = (normalizedCliffMonths > 0 && month === normalizedCliffMonths)
      || (month > normalizedCliffMonths && (month - normalizedCliffMonths) % frequencyMonths === 0)
      || month === vestingMonths

    if (!isVestEvent) continue

    events.push({
      vestDate: addMonths(grantDate, month),
      shareCount: Number((monthlyShares * monthsAccrued).toFixed(6)),
    })
    monthsAccrued = 0
  }

  return events
}

function addMonths(isoDate: string, months: number): string {
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map((part) => Number(part))
  const date = new Date(year, month - 1 + months, day)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
