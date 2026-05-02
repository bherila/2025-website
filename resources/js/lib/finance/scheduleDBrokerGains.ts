import currency from 'currency.js'

import { parseMoney } from '@/lib/finance/money'

const ST_GAIN_KEYS = ['b_st_gain_loss', 'b_st_reported_gain_loss'] as const
const LT_GAIN_KEYS = ['b_lt_gain_loss', 'b_lt_reported_gain_loss'] as const
const TOTAL_GAIN_KEYS = ['b_total_gain_loss', 'total_realized_gain_loss'] as const
const FORM_8949_BOX_TO_LINE = {
  A: '1b',
  B: '2',
  C: '3',
  D: '8b',
  E: '9',
  F: '10',
} as const

export type ScheduleDBrokerLine = '1a' | '1b' | '2' | '3' | '8a' | '8b' | '9' | '10'
type Form8949Box = keyof typeof FORM_8949_BOX_TO_LINE

function readMoneyField(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = parseMoney(record[key])
    if (value !== null) {
      return value
    }
  }

  return null
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }
  if (value === 1 || value === '1' || value === 'true') {
    return true
  }
  if (value === 0 || value === '0' || value === 'false') {
    return false
  }

  return null
}

function normalizeForm8949Box(value: unknown, isShortTerm: boolean | null, isCovered: boolean | null): Form8949Box | null {
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase()
    if (normalized in FORM_8949_BOX_TO_LINE) {
      return normalized as Form8949Box
    }
  }

  if (isShortTerm === null) {
    return null
  }

  if (isCovered === false) {
    return isShortTerm ? 'B' : 'E'
  }

  return isShortTerm ? 'A' : 'D'
}

function transactionDescription(transaction: Record<string, unknown>): string {
  const description = typeof transaction.description === 'string' ? transaction.description.trim() : ''
  const symbol = typeof transaction.symbol === 'string' ? transaction.symbol.trim() : ''

  return description || symbol || '1099-B transaction'
}

export interface ScheduleDBrokerGains {
  shortTermGain: number
  longTermGain: number
  totalGain: number
  usedTotalAsShortTermFallback: boolean
  lineAmounts: Partial<Record<ScheduleDBrokerLine, number>>
  transactionSources: {
    line: ScheduleDBrokerLine
    description: string
    amount: number
    form8949Box: Form8949Box
  }[]
}

export function readScheduleDBrokerGains(record: Record<string, unknown>): ScheduleDBrokerGains {
  const transactionSources = Array.isArray(record.transactions)
    ? record.transactions.flatMap((transaction) => {
        if (!transaction || typeof transaction !== 'object') {
          return []
        }

        const source = transaction as Record<string, unknown>
        const amount = parseMoney(source.realized_gain_loss)
        if (amount === null || amount === 0) {
          return []
        }

        const form8949Box = normalizeForm8949Box(
          source.form_8949_box,
          readBoolean(source.is_short_term),
          readBoolean(source.is_covered),
        )
        if (form8949Box === null) {
          return []
        }

        return [{
          line: FORM_8949_BOX_TO_LINE[form8949Box],
          description: transactionDescription(source),
          amount,
          form8949Box,
        }]
      })
    : []

  const transactionLineAmounts = transactionSources.reduce<Partial<Record<ScheduleDBrokerLine, number>>>((acc, source) => {
    acc[source.line] = currency(acc[source.line] ?? 0).add(source.amount).value
    return acc
  }, {})

  if (transactionSources.length > 0) {
    const shortTermGain = currency(transactionLineAmounts['1b'] ?? 0)
      .add(transactionLineAmounts['2'] ?? 0)
      .add(transactionLineAmounts['3'] ?? 0)
      .value
    const longTermGain = currency(transactionLineAmounts['8b'] ?? 0)
      .add(transactionLineAmounts['9'] ?? 0)
      .add(transactionLineAmounts['10'] ?? 0)
      .value

    return {
      shortTermGain,
      longTermGain,
      totalGain: currency(shortTermGain).add(longTermGain).value,
      usedTotalAsShortTermFallback: false,
      lineAmounts: transactionLineAmounts,
      transactionSources,
    }
  }

  const shortTermValue = readMoneyField(record, ST_GAIN_KEYS)
  const longTermValue = readMoneyField(record, LT_GAIN_KEYS)
  const totalValue = readMoneyField(record, TOTAL_GAIN_KEYS)
  const usedTotalAsShortTermFallback = shortTermValue === null && longTermValue === null && totalValue !== null
  const shortTermGain = shortTermValue ?? (usedTotalAsShortTermFallback ? totalValue : 0)
  const longTermGain = longTermValue ?? 0

  return {
    shortTermGain,
    longTermGain,
    totalGain: totalValue ?? 0,
    usedTotalAsShortTermFallback,
    lineAmounts: {
      ...(shortTermGain !== 0 ? { '1a': shortTermGain } : {}),
      ...(longTermGain !== 0 ? { '8a': longTermGain } : {}),
    },
    transactionSources,
  }
}
