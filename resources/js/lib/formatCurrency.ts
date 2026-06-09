import currency from 'currency.js'

import { parseMoney } from '@/lib/finance/money'

interface CompactCurrencyUnit {
  divisor: number
  suffix: string
  threshold: number
}

const COMPACT_CURRENCY_UNITS: CompactCurrencyUnit[] = [
  { threshold: 1000000000, divisor: 1000000000, suffix: 'B' },
  { threshold: 1000000, divisor: 1000000, suffix: 'M' },
  { threshold: 1000, divisor: 1000, suffix: 'k' },
]

export function formatFriendlyAmount(amount: number): string {
  const absAmount = Math.abs(amount)
  if (absAmount >= 1000000) {
    const millions = amount / 1000000
    return millions % 1 === 0 ? `${millions}m` : `${millions.toFixed(1)}m`
  } else if (absAmount >= 1000) {
    const thousands = amount / 1000
    return thousands % 1 === 0 ? `${thousands}k` : `${thousands.toFixed(1)}k`
  }
  return amount.toFixed(0)
}

function compactAmountForUnit(amount: number, unit: CompactCurrencyUnit): number {
  return currency(amount, { precision: 6 }).divide(unit.divisor).value
}

function compactCurrencyDisplayAmount(compactAmount: number): string {
  return compactAmount < 10 && compactAmount % 1 !== 0
    ? compactAmount.toFixed(1).replace(/\.0$/, '')
    : String(Math.round(compactAmount))
}

function formatCompactCurrencyAmount(amount: number): string {
  const isNegative = amount < 0
  const absAmount = isNegative ? currency(amount).multiply(-1).value : currency(amount).value

  if (absAmount < 1000) {
    return `${isNegative ? '-' : ''}${currency(absAmount, { precision: 0 }).format()}`
  }

  const selectedIndex = COMPACT_CURRENCY_UNITS.findIndex((unit) => absAmount >= unit.threshold)
  const unitIndex = selectedIndex === -1 ? COMPACT_CURRENCY_UNITS.length - 1 : selectedIndex
  const unit = COMPACT_CURRENCY_UNITS[unitIndex]!
  const compactAmount = compactAmountForUnit(absAmount, unit)

  if (Math.round(compactAmount) >= 1000 && unitIndex > 0) {
    const promotedUnit = COMPACT_CURRENCY_UNITS[unitIndex - 1]!
    return `${isNegative ? '-' : ''}$${compactCurrencyDisplayAmount(compactAmountForUnit(absAmount, promotedUnit))}${promotedUnit.suffix}`
  }

  return `${isNegative ? '-' : ''}$${compactCurrencyDisplayAmount(compactAmount)}${unit.suffix}`
}

function decimalPrecisionForDisplay(amount: number): number {
  if (Number.isInteger(amount)) {
    return 0
  }

  const normalized = amount.toString().includes('e')
    ? amount.toFixed(8).replace(/0+$/, '')
    : amount.toString()

  return Math.min(normalized.split('.')[1]?.length ?? 0, 8)
}

export function formatCurrencyInput(value: string | number | null | undefined): string {
  const amount = parseMoney(value)
  if (amount === null) {
    return ''
  }

  return currency(amount, {
    symbol: '',
    precision: decimalPrecisionForDisplay(amount),
  }).format()
}

export function formatFriendlyCurrencyAmount(value: string | number | null | undefined): string {
  const amount = parseMoney(value)
  return amount === null ? '-' : formatCompactCurrencyAmount(amount)
}

export function formatCurrency(value: string | number | null | undefined): string {
  const amount = parseMoney(value)
  return amount === null ? '-' : currency(amount).format()
}
