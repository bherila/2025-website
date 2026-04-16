/**
 * Short Dividend Holding Period Analysis
 *
 * When you hold a short stock position and the company pays a dividend, your
 * broker charges you the dividend amount (it appears as a negative "Dividend"
 * transaction).  The IRS classifies these charges based on how long you held
 * the short position on the ex-dividend date:
 *
 *   > 45 days  → Itemized deduction (Schedule A, investment interest)
 *   ≤ 45 days  → Added to cost basis of the short position (not separately
 *                 deductible; lowers your gain or increases your loss when
 *                 you close the position)
 *
 * This module provides logic to:
 *  1. Identify short dividend transactions in an account's line items.
 *  2. Pair each with the matching short-opening transaction to determine the
 *     holding period on the ex-dividend (= dividend) date.
 *  3. Classify into "itemized deduction" vs "add to cost basis" buckets.
 *
 * Reference: IRS Publication 550, "Short Sales" section.
 */

import currency from 'currency.js'

import type { AccountLineItem } from '@/data/finance/AccountLineItem'

/** Threshold in days: positions held > 45 days qualify for itemized deduction. */
export const SHORT_DIVIDEND_THRESHOLD_DAYS = 45

export interface ShortDividendEntry {
  /** The dividend transaction (t_amt < 0, t_type === 'Dividend') */
  transaction: AccountLineItem
  /** Symbol of the shorted stock */
  symbol: string
  /** Amount charged (positive number; the original t_amt is negative) */
  amountCharged: number
  /** Date of the dividend (ex-dividend date ≈ t_date) */
  dividendDate: string
  /**
   * Date the short position was opened, if a matching Sell Short transaction
   * was found.  Null when we cannot determine the open date.
   */
  shortOpenDate: string | null
  /** Calendar days the position was held on the dividend date (null = unknown) */
  daysHeld: number | null
  /**
   * IRS classification:
   *  - 'itemized_deduction'  → held > 45 days → Schedule A deduction
   *  - 'cost_basis'          → held ≤ 45 days → added to cost basis
   *  - 'unknown'             → cannot determine (no matching open transaction)
   */
  treatment: 'itemized_deduction' | 'cost_basis' | 'unknown'
}

export interface ShortDividendSummary {
  /** All classified short dividend entries */
  entries: ShortDividendEntry[]
  /** Entries eligible for itemized deduction (held > 45 days) */
  itemizedDeductionEntries: ShortDividendEntry[]
  /** Entries that should be added to cost basis (held ≤ 45 days) */
  costBasisEntries: ShortDividendEntry[]
  /** Entries where holding period is unknown */
  unknownEntries: ShortDividendEntry[]
  /** Total amount eligible for itemized deduction */
  totalItemizedDeduction: number
  /** Total amount to add to cost basis */
  totalCostBasis: number
  /** Total amount where treatment is unknown */
  totalUnknown: number
}

/**
 * Determine if a transaction is a charged short dividend.
 * Fidelity marks short dividends with "(Short)" in the description.
 */
function isShortDividend(t: AccountLineItem): boolean {
  if (t.t_type !== 'Dividend') return false
  if ((t.t_amt ?? 0) >= 0) return false   // must be negative (charged)

  const desc = ((t.t_description ?? '') + ' ' + (t.t_comment ?? '')).toUpperCase()
  return desc.includes('SHORT') || desc.includes('CHARGED') || desc.includes('SHORT SALE')
}

/**
 * Count calendar days between two ISO date strings (date2 - date1).
 * Uses Date.UTC to avoid DST transitions producing 23/25-hour days
 * that would miscount the 45-day threshold.
 */
function daysBetween(date1: string, date2: string): number {
  const parts1 = date1.split('-').map(Number)
  const parts2 = date2.split('-').map(Number)
  const ms1 = Date.UTC(parts1[0] ?? 0, (parts1[1] ?? 1) - 1, parts1[2] ?? 1)
  const ms2 = Date.UTC(parts2[0] ?? 0, (parts2[1] ?? 1) - 1, parts2[2] ?? 1)
  return Math.round((ms2 - ms1) / (1000 * 60 * 60 * 24))
}

/**
 * Find the most recent Sell Short opening transaction for a symbol that
 * occurred on or before the dividend date.
 */
function findShortOpenDate(
  symbol: string,
  dividendDate: string,
  transactions: AccountLineItem[],
): string | null {
  const shortOpens = transactions.filter(
    (t) =>
      t.t_symbol === symbol &&
      t.t_type === 'Sell Short' &&
      t.t_date <= dividendDate,
  )

  if (shortOpens.length === 0) return null

  // Return the most recent one before or on the dividend date
  return shortOpens.sort((a, b) => b.t_date.localeCompare(a.t_date))[0]?.t_date ?? null
}

/**
 * Analyse all transactions in an account and return a ShortDividendSummary.
 */
export function analyzeShortDividends(transactions: AccountLineItem[]): ShortDividendSummary {
  const entries: ShortDividendEntry[] = []

  for (const t of transactions) {
    if (!isShortDividend(t)) continue

    const symbol = t.t_symbol ?? ''
    const amountCharged = Math.abs(t.t_amt ?? 0)
    const dividendDate = t.t_date

    const shortOpenDate = symbol ? findShortOpenDate(symbol, dividendDate, transactions) : null
    const daysHeld = shortOpenDate ? daysBetween(shortOpenDate, dividendDate) : null

    let treatment: ShortDividendEntry['treatment']
    if (daysHeld === null) {
      treatment = 'unknown'
    } else if (daysHeld > SHORT_DIVIDEND_THRESHOLD_DAYS) {
      treatment = 'itemized_deduction'
    } else {
      treatment = 'cost_basis'
    }

    entries.push({
      transaction: t,
      symbol,
      amountCharged,
      dividendDate,
      shortOpenDate,
      daysHeld,
      treatment,
    })
  }

  // Sort by date desc
  entries.sort((a, b) => b.dividendDate.localeCompare(a.dividendDate))

  const itemizedDeductionEntries = entries.filter((e) => e.treatment === 'itemized_deduction')
  const costBasisEntries = entries.filter((e) => e.treatment === 'cost_basis')
  const unknownEntries = entries.filter((e) => e.treatment === 'unknown')

  const sumCharged = (arr: ShortDividendEntry[]) =>
    arr.reduce((acc, e) => acc.add(e.amountCharged), currency(0)).value

  return {
    entries,
    itemizedDeductionEntries,
    costBasisEntries,
    unknownEntries,
    totalItemizedDeduction: sumCharged(itemizedDeductionEntries),
    totalCostBasis: sumCharged(costBasisEntries),
    totalUnknown: sumCharged(unknownEntries),
  }
}
