import type currency from 'currency.js'

export interface IAward {
  id?: number
  award_id?: string
  grant_date?: string
  vest_date?: string
  share_count?: currency | number
  symbol?: string
  vest_price?: number | null // price per share at vest date
  vest_price_source?: 'manual' | 'imported' | 'quote_close' | 'unknown' | null
  grant_price?: number | null // price per share at grant date
  grant_price_source?: 'manual' | 'imported' | 'quote_close' | 'unknown' | null
  settlement_allocations?: unknown[]
  rsu_links?: unknown[]
  isVirtual?: boolean
}
