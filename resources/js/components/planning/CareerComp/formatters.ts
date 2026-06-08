import currency from 'currency.js'

import { parseMoneyOrZero } from '@/lib/finance/money'
import { formatFriendlyCurrencyAmount } from '@/lib/formatCurrency'

export function formatMoney(value: number | null | undefined): string {
  return currency(value ?? 0, { precision: 0 }).format()
}

export function formatMoneyInput(value: number | string | null | undefined): string {
  const amount = parseMoneyOrZero(value)
  const precision = Number.isInteger(amount) ? 0 : 2

  return currency(amount, { precision, symbol: '' }).format()
}

export function formatFriendlyMoney(value: number | null | undefined): string {
  return formatFriendlyCurrencyAmount(value ?? 0)
}

export function formatSignedMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—'
  }
  const formatted = formatMoney(Math.abs(value))
  return value < 0 ? `-${formatted}` : `+${formatted}`
}

export function formatSignedFriendlyMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—'
  }
  const formatted = formatFriendlyCurrencyAmount(value)
  return value < 0 ? formatted : `+${formatted}`
}

export function formatShares(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}
