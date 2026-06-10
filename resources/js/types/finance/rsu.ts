import type currency from 'currency.js'

export type RsuLinkType =
  | 'share_deposit'
  | 'sell_to_cover'
  | 'withholding_cash'
  | 'excess_refund'
  | 'sale'
  | 'tax_lot'
  | 'payslip_rsu_income'
  | 'payslip_rsu_tax_offset'
  | 'payslip_rsu_excess_refund'
  | 'other'

export interface IRsuSettlement {
  id: number
  vest_date?: string
  symbol?: string
  status?: 'suggested' | 'confirmed' | 'ignored' | string
  gross_shares?: string | number | null
  gross_income?: string | number | null
  withheld_shares_whole?: string | number | null
  withheld_value?: string | number | null
  actual_tax_remitted?: string | number | null
  excess_refund?: string | number | null
  brokerage_account_id?: number | null
  payslip_id?: number | null
  refund_payslip_id?: number | null
}

export interface IRsuSettlementAllocation {
  id?: number
  settlement_id?: number
  equity_award_id?: number
  vested_shares?: string | number | null
  gross_income?: string | number | null
  allocated_withheld_value?: string | number | null
  allocated_tax_remitted?: string | number | null
  allocated_excess_refund?: string | number | null
  settlement?: IRsuSettlement | null
}

export interface IRsuLink {
  id: number
  settlement_id?: number | null
  settlement_allocation_id?: number | null
  equity_award_id?: number | null
  link_type: RsuLinkType
  transaction_id?: number | null
  account_id?: number | null
  lot_id?: number | null
  payslip_id?: number | null
  status?: 'suggested' | 'confirmed' | 'ignored' | string
  notes?: string | null
  settlement?: IRsuSettlement | null
}

export interface IAward {
  id?: number
  award_id?: string
  grant_date?: string
  vest_date?: string
  share_count?: currency | number | string
  symbol?: string
  vest_price?: number | null // price per share at vest date
  vest_price_source?: 'manual' | 'imported' | 'quote_close' | 'unknown' | null
  grant_price?: number | null // price per share at grant date
  grant_price_source?: 'manual' | 'imported' | 'quote_close' | 'unknown' | null
  settlement_allocations?: IRsuSettlementAllocation[]
  rsu_links?: IRsuLink[]
  isVirtual?: boolean
  virtualKind?: 'current_job_refresher'
  virtualYear?: number
  virtualValue?: number
  virtualSourceLabel?: string
}
