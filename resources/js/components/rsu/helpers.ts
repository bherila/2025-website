import currency from 'currency.js'

import type { IAward } from '@/types/finance'

// Format a Date as YYYY-MM-DD using its local components.
// Don't use `.toISOString().slice(0, 10)` — that's UTC, which rolls over hours
// early/late depending on offset and would mis-flag a same-day vest as vested
// for users west of UTC (e.g. US locales after late afternoon).
export function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayIso(): string {
  return toLocalIsoDate(new Date())
}

export function isVested(award: Pick<IAward, 'vest_date'>, today: string = todayIso()): boolean {
  return !!award.vest_date && award.vest_date <= today
}

export function getShares(award: Pick<IAward, 'share_count'>): number | undefined {
  const s = award.share_count
  if (s == null) {
    return undefined
  }
  if (typeof s === 'string' && s.trim() === '') {
    return undefined
  }
  // The /api/rsu payload serializes share_count via Laravel's decimal cast, which
  // can surface as a numeric string (e.g. "10.125000"); normalize to a number so
  // callers never accidentally do string concatenation. currency.js objects expose .value.
  return typeof s === 'object' ? s.value : Number(s)
}

export function shareValue(shares: number | undefined, pricePerShare: number | null | undefined): number | null {
  if (shares == null || pricePerShare == null) {
    return null
  }
  return currency(shares).multiply(pricePerShare).value
}

export function sharePriceSourceLabel(source: IAward['vest_price_source'] | IAward['grant_price_source']): string {
  if (source === 'quote_close') return 'Quote close'
  if (source === 'manual') return 'Manual'
  if (source === 'imported') return 'Imported'
  if (source === 'unknown') return 'Legacy'
  return 'No source'
}
