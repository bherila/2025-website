import currency from 'currency.js'

import { parseMoney } from '@/lib/finance/money'

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

function formatCompactCurrencyAmount(amount: number): string {
  const isNegative = amount < 0
  const absAmount = isNegative ? currency(amount).multiply(-1).value : currency(amount).value

  if (absAmount < 1000) {
    return `${isNegative ? '-' : ''}${currency(absAmount, { precision: 0 }).format()}`
  }

  const unit = absAmount >= 1000000000
    ? { divisor: 1000000000, suffix: 'B' }
    : absAmount >= 1000000
      ? { divisor: 1000000, suffix: 'M' }
      : { divisor: 1000, suffix: 'k' }
  const compactAmount = currency(absAmount).divide(unit.divisor).value
  const displayAmount = compactAmount < 10 && compactAmount % 1 !== 0
    ? compactAmount.toFixed(1).replace(/\.0$/, '')
    : String(Math.round(compactAmount))

  return `${isNegative ? '-' : ''}$${displayAmount}${unit.suffix}`
}

export function formatFriendlyCurrencyAmount(value: string | number | null | undefined): string {
  const amount = parseMoney(value)
  return amount === null ? '-' : formatCompactCurrencyAmount(amount)
}

export function formatCurrency(value: string | number | null | undefined): string {
  const amount = parseMoney(value)
  return amount === null ? '-' : currency(amount).format()
}
