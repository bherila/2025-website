import currency from 'currency.js'

export function formatMoney(value: number | null | undefined): string {
  return currency(value ?? 0, { precision: 0 }).format()
}

export function formatSignedMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—'
  }
  const formatted = formatMoney(Math.abs(value))
  return value < 0 ? `-${formatted}` : `+${formatted}`
}

export function formatShares(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}
