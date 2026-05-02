import currency from 'currency.js'

export type MoneyInput = unknown

/**
 * Parse tax-form money values with currency.js so commas, currency symbols,
 * leading signs, and accounting parentheses all behave consistently.
 */
export function parseMoney(value: MoneyInput): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? currency(value).value : null
  if (typeof value !== 'string') return null

  const raw = value.trim()
  if (raw === '' || raw.toLowerCase() === 'null') return null
  if (!/\d/.test(raw)) return null

  return currency(raw, { errorOnInvalid: false }).value
}

export function parseMoneyOrZero(value: MoneyInput): number {
  return parseMoney(value) ?? 0
}

export function sumMoneyValues(values: MoneyInput[]): number {
  return values.reduce<currency>((acc, value) => acc.add(parseMoneyOrZero(value)), currency(0)).value
}
