import type { AccountLineItem } from '@/data/finance/AccountLineItem'

export type FeeStatus = 'under' | 'on_target' | 'over'
export type ReconciliationStatus = 'match' | 'mismatch' | 'unclassified'

export interface FeeBreakdown {
  fee_schE: number
  fee_irc67g: number
  untagged: number
}

export interface MonthlyFeeDragPoint {
  month: string
  gross_return: number
  net_return: number
  fees: number
}

export interface FeeLineItem extends AccountLineItem {
  fee_amount: number
  tax_characteristic: string | null
}

export interface K1ReconciliationRow {
  entity_name: string
  k1_fees_schE: number
  k1_fees_irc67g: number
  statement_fees_schE: number
  statement_fees_irc67g: number
  delta_schE: number
  delta_irc67g: number
  status: ReconciliationStatus
  tax_document_id: number | null
  account_id: number
}

export interface FeesAccount {
  acct_id: number
  acct_name: string
  acct_last_balance: number
  expected_fee_pct: number | null
  expected_fee_flat: number | null
  expected_fee_notes: string | null
}

export interface FeeConstants {
  mismatch_threshold_usd: number
  on_target_tolerance: number
}

export interface AccountFeeSummary {
  acct_id: number
  acct_name: string
  balance: number
  expected_fees: number
  has_expectation: boolean
  actual_fees: number
  delta: number
  status: FeeStatus | null
  pct_of_balance: number | null
  fees_url: string
}

export interface ReconciliationSummary {
  matched: number
  mismatched: number
  unclassified: number
  unlinked: number
}

export function currentTaxYear(): number {
  return new Date().getFullYear()
}

export function statusLabel(status: FeeStatus | null): string {
  if (status === 'under') return 'Under'
  if (status === 'over') return 'Over'
  if (status === 'on_target') return 'On-target'
  return '-'
}

export function statusClassName(status: FeeStatus | null): string {
  if (status === 'under') return 'border-sky-600 text-sky-700 dark:text-sky-300'
  if (status === 'over') return 'border-red-600 text-red-700 dark:text-red-300'
  if (status === 'on_target') return 'border-emerald-600 text-emerald-700 dark:text-emerald-300'
  return 'border-muted-foreground text-muted-foreground'
}
