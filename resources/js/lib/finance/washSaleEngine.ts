/**
 * Wash Sale Detection Engine
 *
 * Implements IRS wash sale rules for detecting disallowed losses on
 * security transactions. A wash sale occurs when a security is sold
 * at a loss and a "substantially identical" security is purchased
 * within 30 days before or after the sale.
 *
 * Uses currency.js for precise financial arithmetic to avoid
 * floating-point rounding issues.
 *
 * See docs/finance/LotAnalyzer.md for detailed documentation.
 */

import currency from 'currency.js'

import type { AccountLineItem } from '@/types/finance/account-line-item'

// ============================================================================
// Types
// ============================================================================

export interface LotSale {
  /** Description for IRS Form 8949 col (a), e.g. "100 sh. AAPL" */
  description: string
  /** Symbol of the security */
  symbol: string
  /** The account ID of the sale */
  accountId?: number | null | undefined
  /** The account name of the sale */
  accountName?: string | null | undefined
  /** Date acquired (purchase date) */
  dateAcquired: string | null
  /** Transactions that make up the cost basis of this sale */
  acquiredTransactions?: Array<{
    id: number | undefined
    date: string
    qty: number
    price: number
    description: string
  }>
  /** Date sold */
  dateSold: string
  /** Proceeds (sales price) — col (d) */
  proceeds: number
  /** Cost or other basis — col (e) */
  costBasis: number
  /** IRS adjustment code — col (f), e.g. "W" for wash sale */
  adjustmentCode: string
  /** Adjustment amount — col (g) */
  adjustmentAmount: number
  /** Gain or loss — col (h) = (d) - (e) + (g) */
  gainOrLoss: number
  /** Whether this is short-term (< 365 days) or long-term */
  isShortTerm: boolean
  /** Quantity sold */
  quantity: number
  /** The transaction ID of the sale */
  saleTransactionId: number | undefined
  /** The transaction ID of the matching purchase (for wash sales) */
  washPurchaseTransactionId: number | undefined
  /** Whether this sale is a wash sale */
  isWashSale: boolean
  /** Original loss before wash sale disallowance */
  originalLoss: number
  /** Disallowed loss (positive number) */
  disallowedLoss: number
  /** Whether this was a short sale (Sell short) */
  isShortSale: boolean
}

/**
 * Configuration for wash sale detection.
 *
 * Method 1 (recommended): All four flags enabled — treats any option on
 *   the same underlying as substantially identical.
 * Method 2 (broker-style / 1099-B): All flags false — options must have
 *   identical ticker (same strike, expiration, type) to trigger a wash sale.
 */
export interface WashSaleOptions {
  /**
   * When true, a wash sale can trigger across short and long positions.
   * Example: Close a short at a loss, then open a new short -> wash sale.
   */
  adjustShortLong: boolean
  /**
   * When true, selling stock at a loss then buying a CALL option on the
   * same underlying triggers a wash sale.
   */
  adjustStockToOption: boolean
  /**
   * When true, selling a CALL option at a loss then buying stock of the
   * same underlying triggers a wash sale.
   */
  adjustOptionToStock: boolean
  /**
   * Master flag: when true, option contracts for the same underlying
   * security are considered substantially identical regardless of strike,
   * expiration, or type. When false, adjustStockToOption and
   * adjustOptionToStock are also forced to false.
   */
  adjustSameUnderlying: boolean
}

/** Backwards-compatible single-boolean options */
export interface LegacyWashSaleOptions {
  includeOptions: boolean
}

/** Method 1 preset: all cross-type flags enabled */
export const WASH_SALE_METHOD_1: WashSaleOptions = {
  adjustShortLong: true,
  adjustStockToOption: true,
  adjustOptionToStock: true,
  adjustSameUnderlying: true,
}

/** Method 2 preset: identical ticker only, no cross-type matching */
export const WASH_SALE_METHOD_2: WashSaleOptions = {
  adjustShortLong: false,
  adjustStockToOption: false,
  adjustOptionToStock: false,
  adjustSameUnderlying: false,
}

// ============================================================================
// Internal Types
// ============================================================================

interface ParsedTransaction {
  id: number | undefined
  internalIndex: number
  accountId: number | null | undefined
  accountName: string | null | undefined
  date: Date
  dateStr: string
  symbol: string
  type: string
  qty: number
  price: currency
  amount: currency
  description: string
  isOption: boolean
  optType: string | null
  optExpiration: string | null
  optStrike: number | null
  /** Normalized symbol for matching (strips option suffixes) */
  matchSymbol: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Parse a date string as a local date (no timezone issues). */
function parseDate(dateStr: string): Date {
  const parts = dateStr.split(/[-/T ]/)
  if (parts.length >= 3) {
    return new Date(parseInt(parts[0]!, 10), parseInt(parts[1]!, 10) - 1, parseInt(parts[2]!, 10))
  }
  return new Date(dateStr)
}

/** Calculate the number of days between two dates. */
function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86400000
  return Math.round(Math.abs(a.getTime() - b.getTime()) / msPerDay)
}

/** Normalise WashSaleOptions, handling legacy single-boolean format. */
export function normalizeOptions(opts: WashSaleOptions | LegacyWashSaleOptions): WashSaleOptions {
  if ('includeOptions' in opts) {
    return opts.includeOptions ? WASH_SALE_METHOD_1 : WASH_SALE_METHOD_2
  }
  if (!opts.adjustSameUnderlying) {
    return { ...opts, adjustStockToOption: false, adjustOptionToStock: false }
  }
  return opts
}

// -- Transaction type classification -----------------------------------------

function isRegularSale(type: string): boolean {
  const t = type.toLowerCase().trim()
  if (t.includes('sell short') || t.includes('sellshort') || t.includes('sell to open')) return false
  return (t.includes('sell') || t === 'assigned' || t === 'exercised')
}

function isShortOpening(type: string): boolean {
  const t = type.toLowerCase().trim()
  return t.includes('sell short') || t.includes('sellshort') || t.includes('sell to open')
}

function isRegularBuy(type: string): boolean {
  const t = type.toLowerCase().trim()
  if (t.includes('buy to cover') || t.includes('buytocover') || t.includes('buy to close')) return false
  return (t.includes('buy') || t.includes('reinvest'))
}

function isShortClosing(type: string): boolean {
  const t = type.toLowerCase().trim()
  return t.includes('buy to cover') || t.includes('buytocover') || t.includes('buy to close')
}

function isBuyType(type: string): boolean {
  return isRegularBuy(type) || isShortClosing(type)
}

function isSaleType(type: string): boolean {
  return isRegularSale(type) || isShortOpening(type)
}

function isClosingTransaction(type: string): boolean {
  return isRegularSale(type) || isShortClosing(type)
}

// -- Symbol matching ---------------------------------------------------------

function areSubstantiallyIdentical(
  sale: ParsedTransaction,
  purchase: ParsedTransaction,
  opts: WashSaleOptions,
): boolean {
  const saleUnderlying = sale.matchSymbol
  const purchaseUnderlying = purchase.matchSymbol

  if (opts.adjustSameUnderlying) {
    if (saleUnderlying !== purchaseUnderlying) return false
    if (!sale.isOption && purchase.isOption) return opts.adjustStockToOption
    if (sale.isOption && !purchase.isOption) return opts.adjustOptionToStock
    if (sale.isOption && purchase.isOption) return true
    return true
  }

  // adjustSameUnderlying OFF (Method 2)
  if (sale.isOption || purchase.isOption) {
    if (sale.isOption !== purchase.isOption) return false
    return sale.symbol.toUpperCase() === purchase.symbol.toUpperCase()
  }
  return sale.symbol.toUpperCase().trim() === purchase.symbol.toUpperCase().trim()
}

// ============================================================================
// Core Algorithm
// ============================================================================

/** Parse account line items into typed transaction records. */
export function parseTransactions(items: AccountLineItem[]): ParsedTransaction[] {
  return items
    .filter(item => {
      if (!item.t_symbol || !item.t_type) return false
      return isSaleType(item.t_type) || isBuyType(item.t_type)
    })
    .map((item, index) => {
      const isOption = !!(item.opt_type || item.opt_expiration)
      const baseSymbol = item.t_symbol!.toUpperCase().trim()
      const matchSymbol = baseSymbol.replace(/\s+\d{6}[CP]\d+$/i, '').trim()

      return {
        id: item.t_id,
        internalIndex: index,
        accountId: item.t_account,
        accountName: item.acct_name,
        date: parseDate(item.t_date),
        dateStr: item.t_date,
        symbol: item.t_symbol!,
        type: item.t_type!,
        qty: Math.abs(Number(item.t_qty) || 0),
        price: currency(Math.abs(Number(item.t_price) || 0)),
        amount: currency(Number(item.t_amt) || 0),
        description: item.t_description || '',
        isOption,
        optType: item.opt_type || null,
        optExpiration: item.opt_expiration || null,
        optStrike: item.opt_strike ? Number(item.opt_strike) : null,
        matchSymbol,
      }
    })
}

/**
 * Analyze transactions and detect wash sales.
 *
 * All currency arithmetic uses currency.js to avoid floating-point drift.
 */
export function analyzeLots(
  transactions: AccountLineItem[],
  options: WashSaleOptions | LegacyWashSaleOptions = WASH_SALE_METHOD_2,
  accountMap?: Map<number, string>,
): LotSale[] {
  const opts = normalizeOptions(options)
  const parsed = parseTransactions(transactions)

  if (accountMap) {
    parsed.forEach(t => {
      if (t.accountId && accountMap.has(t.accountId)) {
        t.accountName = accountMap.get(t.accountId)
      }
    })
  }

  const longPool = parsed.filter(t => isRegularBuy(t.type))
  const shortPool = parsed.filter(t => isShortOpening(t.type))
  const sharesUsed = new Map<number, number>()
  const rawResults: LotSale[] = []

  const sortedClosing = [...parsed.filter(t => isClosingTransaction(t.type))]
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  for (const sale of sortedClosing) {
    const isClosingShort = isShortClosing(sale.type)
    let remainingQty = sale.qty

    const matchingPool = isClosingShort ? shortPool : longPool
    const candidates = matchingPool
      .filter(p => areSubstantiallyIdentical(sale, p, opts))
      .filter(p => p.date.getTime() <= sale.date.getTime())
      .sort((a, b) => a.date.getTime() - b.date.getTime())

    const stMatches: any[] = []
    const ltMatches: any[] = []

    for (const candidate of candidates) {
      if (remainingQty <= 0) break
      const used = sharesUsed.get(candidate.internalIndex) ?? 0
      const available = candidate.qty - used
      if (available <= 0) continue
      const qtyToUse = Math.min(remainingQty, available)
      const unitPrice = candidate.price.value > 0
        ? candidate.price
        : currency(candidate.amount.intValue, { fromCents: true }).divide(candidate.qty)
      const holdingDays = daysBetween(candidate.date, sale.date)
      const match = {
        id: candidate.id,
        internalIndex: candidate.internalIndex,
        date: candidate.dateStr,
        qty: qtyToUse,
        price: unitPrice.value,
        description: candidate.description,
      }
      if (holdingDays <= 365) stMatches.push(match)
      else ltMatches.push(match)
      sharesUsed.set(candidate.internalIndex, used + qtyToUse)
      remainingQty -= qtyToUse
    }

    if (remainingQty > 0) {
      stMatches.push({
        id: undefined, internalIndex: -1, date: null, qty: remainingQty,
        price: sale.price.value > 0 ? sale.price.value : 0, description: 'Unmatched',
      })
    }

    const portions = [
      { matches: stMatches, isShortTerm: true },
      { matches: ltMatches, isShortTerm: false },
    ].filter(p => p.matches.length > 0)

    for (const portion of portions) {
      const portionQty = portion.matches.reduce((s: number, m: any) => s + m.qty, 0)
      const saleUnitProceeds = currency(sale.amount.intValue, { fromCents: true }).divide(sale.qty)
      const portionProceeds = saleUnitProceeds.multiply(portionQty)
      const portionCostBasis = portion.matches.reduce(
        (s: currency, m: any) => s.add(currency(m.price).multiply(m.qty)), currency(0))
      const rawGainLoss = portionProceeds.subtract(portionCostBasis)
      const isLoss = rawGainLoss.value < 0

      let isWashSale = false
      let disallowedLoss = currency(0)
      let washPurchaseId: number | undefined

      if (isLoss) {
        const washStart = new Date(sale.date)
        washStart.setDate(washStart.getDate() - 30)
        const washEnd = new Date(sale.date)
        washEnd.setDate(washEnd.getDate() + 30)
        const acquiredIndices = new Set(portion.matches.map((m: any) => m.internalIndex))
        const replacementPool = opts.adjustShortLong ? [...longPool, ...shortPool] : longPool

        const washCandidates = replacementPool
          .filter(p => areSubstantiallyIdentical(sale, p, opts))
          .filter(p => p.date >= washStart && p.date <= washEnd)
          .filter(p => !acquiredIndices.has(p.internalIndex))
          .sort((a, b) => {
            const aAfter = a.date >= sale.date ? 0 : 1
            const bAfter = b.date >= sale.date ? 0 : 1
            if (aAfter !== bAfter) return aAfter - bAfter
            return Math.abs(a.date.getTime() - sale.date.getTime()) -
              Math.abs(b.date.getTime() - sale.date.getTime())
          })

        for (const cand of washCandidates) {
          const used = sharesUsed.get(cand.internalIndex) ?? 0
          const available = cand.qty - used
          if (available <= 0) continue
          isWashSale = true
          const washQty = Math.min(portionQty, available)
          disallowedLoss = currency(rawGainLoss.value).multiply(-1).divide(portionQty).multiply(washQty)
          washPurchaseId = cand.id
          sharesUsed.set(cand.internalIndex, used + washQty)
          break
        }
      }

      const adjAmt = isWashSale ? disallowedLoss : currency(0)
      const adjCode = isWashSale ? 'W' : ''
      const gainOrLoss = rawGainLoss.add(adjAmt)
      const actualMatches = portion.matches.filter((m: any) => m.internalIndex !== -1)
      let dateAcquired: string | null = null
      if (actualMatches.length === 1) dateAcquired = actualMatches[0].date
      else if (actualMatches.length > 1) dateAcquired = null

      rawResults.push({
        description: `${portionQty} sh. ${sale.symbol}`,
        symbol: sale.symbol,
        accountId: sale.accountId,
        accountName: sale.accountName,
        dateAcquired,
        acquiredTransactions: actualMatches,
        dateSold: sale.dateStr,
        proceeds: portionProceeds.value,
        costBasis: portionCostBasis.value,
        adjustmentCode: adjCode,
        adjustmentAmount: adjAmt.value,
        gainOrLoss: gainOrLoss.value,
        isShortTerm: portion.isShortTerm,
        quantity: portionQty,
        saleTransactionId: sale.id,
        washPurchaseTransactionId: washPurchaseId,
        isWashSale,
        originalLoss: isLoss ? rawGainLoss.value : 0,
        disallowedLoss: disallowedLoss.value,
        isShortSale: isClosingShort,
      })
    }
  }

  return mergeLotSales(rawResults)
}

// ============================================================================
// Merge helper
// ============================================================================

function mergeLotSales(lots: LotSale[]): LotSale[] {
  const merged = new Map<string, LotSale>()
  for (const lot of lots) {
    const key = `${lot.symbol}|${lot.dateSold}|${lot.isShortTerm}|${lot.isShortSale}|${lot.adjustmentCode}|${lot.accountId}`
    const existing = merged.get(key)
    if (existing) {
      existing.quantity += lot.quantity
      existing.proceeds = currency(existing.proceeds).add(lot.proceeds).value
      existing.costBasis = currency(existing.costBasis).add(lot.costBasis).value
      existing.adjustmentAmount = currency(existing.adjustmentAmount).add(lot.adjustmentAmount).value
      existing.gainOrLoss = currency(existing.gainOrLoss).add(lot.gainOrLoss).value
      existing.originalLoss = currency(existing.originalLoss).add(lot.originalLoss).value
      existing.disallowedLoss = currency(existing.disallowedLoss).add(lot.disallowedLoss).value
      existing.description = `${existing.quantity} sh. ${existing.symbol}`
      if (existing.dateAcquired !== lot.dateAcquired) existing.dateAcquired = null
      if (lot.acquiredTransactions)
        existing.acquiredTransactions = (existing.acquiredTransactions || []).concat(lot.acquiredTransactions)
    } else {
      merged.set(key, { ...lot })
    }
  }
  return Array.from(merged.values())
}

// ============================================================================
// Summary helpers
// ============================================================================

export interface LotAnalysisSummary {
  totalProceeds: number
  totalCostBasis: number
  totalAdjustments: number
  totalGainLoss: number
  totalWashSaleDisallowed: number
  shortTermGain: number
  shortTermLoss: number
  longTermGain: number
  longTermLoss: number
  washSaleCount: number
  totalSales: number
}

export function computeSummary(lots: LotSale[]): LotAnalysisSummary {
  let totalProceeds = currency(0)
  let totalCostBasis = currency(0)
  let totalAdjustments = currency(0)
  let totalGainLoss = currency(0)
  let totalWashSaleDisallowed = currency(0)
  let shortTermGain = currency(0)
  let shortTermLoss = currency(0)
  let longTermGain = currency(0)
  let longTermLoss = currency(0)
  let washSaleCount = 0

  for (const lot of lots) {
    totalProceeds = totalProceeds.add(lot.proceeds)
    totalCostBasis = totalCostBasis.add(lot.costBasis)
    totalAdjustments = totalAdjustments.add(lot.adjustmentAmount)
    totalGainLoss = totalGainLoss.add(lot.gainOrLoss)
    if (lot.isWashSale) {
      washSaleCount++
      totalWashSaleDisallowed = totalWashSaleDisallowed.add(lot.disallowedLoss)
    }
    if (lot.isShortTerm) {
      if (lot.gainOrLoss >= 0) shortTermGain = shortTermGain.add(lot.gainOrLoss)
      else shortTermLoss = shortTermLoss.add(lot.gainOrLoss)
    } else {
      if (lot.gainOrLoss >= 0) longTermGain = longTermGain.add(lot.gainOrLoss)
      else longTermLoss = longTermLoss.add(lot.gainOrLoss)
    }
  }

  return {
    totalProceeds: totalProceeds.value,
    totalCostBasis: totalCostBasis.value,
    totalAdjustments: totalAdjustments.value,
    totalGainLoss: totalGainLoss.value,
    totalWashSaleDisallowed: totalWashSaleDisallowed.value,
    shortTermGain: shortTermGain.value,
    shortTermLoss: shortTermLoss.value,
    longTermGain: longTermGain.value,
    longTermLoss: longTermLoss.value,
    washSaleCount,
    totalSales: lots.length,
  }
}
