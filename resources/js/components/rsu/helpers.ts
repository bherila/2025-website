import currency from 'currency.js'

import type { IAward } from '@/types/finance'

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function isVested(award: Pick<IAward, 'vest_date'>, today: string = todayIso()): boolean {
  return !!award.vest_date && award.vest_date < today
}

export function getShares(award: Pick<IAward, 'share_count'>): number | undefined {
  const s = award.share_count
  if (s == null) {
    return undefined
  }
  return typeof s === 'object' ? s.value : s
}

export function shareValue(shares: number | undefined, pricePerShare: number | null | undefined): currency | null {
  if (shares == null || pricePerShare == null) {
    return null
  }
  return currency(shares).multiply(pricePerShare)
}
