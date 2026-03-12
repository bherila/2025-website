/**
 * Wash Sale Detection Engine
 *
 * Implements IRS wash sale rules for detecting disallowed losses on
 * security transactions. A wash sale occurs when a security is sold
 * at a loss and a "substantially identical" security is purchased
 * within 30 days before or after the sale.
 *
 * See LotAnalyzer.md for detailed documentation.
 */

import type { AccountLineItem } from '@/types/finance/account-line-item'

// ============================================================================
// Types
// ============================================================================

export interface LotSale {
  /** Description for IRS Form 8949 col (a), e.g. "100 sh. AAPL" */
  description: string
  /** Symbol of the security */
  symbol: string
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

export interface WashSaleOptions {
  /** Include stock options as "substantially similar" to the underlying stock */
  includeOptions: boolean
}

// ============================================================================
// Internal Types
// ============================================================================

interface ParsedTransaction {
  id: number | undefined
  date: Date
  dateStr: string
  symbol: string
  type: string
  qty: number
  price: number
  amount: number
  description: string
  isOption: boolean
  optType: string | null
  /** Normalized symbol for matching (strips option suffixes) */
  matchSymbol: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse a date string as a local date (no timezone issues).
 */
function parseDate(dateStr: string): Date {
  // Ensure YYYY-MM-DD format is parsed as local time
  const parts = dateStr.split(/[-/T ]/)
  if (parts.length >= 3) {
    return new Date(parseInt(parts[0]!, 10), parseInt(parts[1]!, 10) - 1, parseInt(parts[2]!, 10))
  }
  return new Date(dateStr)
}

/**
 * Calculate the number of days between two dates.
 */
function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86400000
  return Math.round(Math.abs(a.getTime() - b.getTime()) / msPerDay)
}

/**
 * Check if a transaction type represents a sale.
 */
function isSaleType(type: string): boolean {
  const t = type.toLowerCase().trim()
  return t === 'sell' || t === 'sell short' || t === 'sellshort' || t === 'sell to close' ||
         t === 'assigned' || t === 'exercised' || t.startsWith('sell')
}

/**
 * Check if a transaction type represents a purchase.
 */
function isBuyType(type: string): boolean {
  const t = type.toLowerCase().trim()
  return t === 'buy' || t === 'buy to cover' || t === 'buy to open' || t === 'buytocover' ||
         t === 'reinvest' || t.startsWith('buy')
}

/**
 * Check if a transaction type represents a short sale.
 */
function isShortSaleType(type: string): boolean {
  const t = type.toLowerCase().trim()
  return t === 'sell short' || t === 'sellshort'
}

/**
 * Get the normalized symbol for matching purposes.
 * For options, returns the underlying symbol if includeOptions is true.
 */
function getNormalizedSymbol(tx: ParsedTransaction, includeOptions: boolean): string {
  if (includeOptions && tx.isOption) {
    // Strip option-specific parts and return underlying symbol
    return tx.matchSymbol
  }
  return tx.symbol.toUpperCase().trim()
}

/**
 * Check if two transactions are "substantially identical" per IRS rules.
 */
function areSubstantiallyIdentical(
  sale: ParsedTransaction,
  purchase: ParsedTransaction,
  includeOptions: boolean
): boolean {
  const saleSymbol = getNormalizedSymbol(sale, includeOptions)
  const purchaseSymbol = getNormalizedSymbol(purchase, includeOptions)

  if (saleSymbol !== purchaseSymbol) return false

  // If not including options as substantially similar, both must be the same type
  if (!includeOptions) {
    // If one is an option and the other isn't, they're not substantially identical
    if (sale.isOption !== purchase.isOption) return false
    // If both are options, they must match on type and underlying
    if (sale.isOption && purchase.isOption) {
      return sale.symbol.toUpperCase() === purchase.symbol.toUpperCase()
    }
  }

  return true
}

// ============================================================================
// Core Algorithm
// ============================================================================

/**
 * Parse account line items into typed transaction records suitable for analysis.
 */
export function parseTransactions(items: AccountLineItem[]): ParsedTransaction[] {
  return items
    .filter(item => {
      // Must have a symbol and a transaction type
      if (!item.t_symbol || !item.t_type) return false
      // Must be a buy or sell
      return isSaleType(item.t_type) || isBuyType(item.t_type)
    })
    .map(item => {
      const isOption = !!(item.opt_type || item.opt_expiration)
      // For options, the match symbol is the underlying equity symbol
      const baseSymbol = item.t_symbol!.toUpperCase().trim()
      const matchSymbol = baseSymbol.replace(/\s+\d{6}[CP]\d+$/i, '').trim()

      return {
        id: item.t_id,
        date: parseDate(item.t_date),
        dateStr: item.t_date,
        symbol: item.t_symbol!,
        type: item.t_type!,
        qty: Math.abs(Number(item.t_qty) || 0),
        price: Math.abs(Number(item.t_price) || 0),
        amount: Number(item.t_amt) || 0,
        description: item.t_description || '',
        isOption,
        optType: item.opt_type || null,
        matchSymbol,
      }
    })
}

/**
 * Analyze transactions and detect wash sales.
 *
 * Algorithm:
 * 1. Separate transactions into sales and purchases.
 * 2. For each sale that results in a loss:
 *    a. Look for purchases of substantially identical securities within
 *       the 61-day wash sale window (30 days before to 30 days after the sale).
 *    b. If found, the loss is disallowed (partially or fully depending on quantity).
 *    c. The disallowed loss is added to the cost basis of the replacement shares.
 *
 * @param transactions Array of AccountLineItem transactions
 * @param options Wash sale detection options
 * @returns Array of LotSale records for IRS Form 8949
 */
export function analyzeLots(
  transactions: AccountLineItem[],
  options: WashSaleOptions = { includeOptions: false }
): LotSale[] {
  const parsed = parseTransactions(transactions)

  const sales = parsed.filter(t => isSaleType(t.type))
  const purchases = parsed.filter(t => isBuyType(t.type))

  // Track how many shares of each purchase have been "used" as wash replacements
  const purchaseUsed = new Map<number, number>()

  const results: LotSale[] = []

  // Sort sales by date
  const sortedSales = [...sales].sort((a, b) => a.date.getTime() - b.date.getTime())

  for (const sale of sortedSales) {
    let remainingSaleQty = sale.qty
    const saleProceeds = Math.abs(sale.amount)
    const isShort = isShortSaleType(sale.type)

    // For a sale, we need to determine the cost basis.
    let costBasis = 0
    let dateAcquired: string | null = null
    const acquiredTransactions: Array<{
      id: number | undefined
      date: string
      qty: number
      price: number
      description: string
    }> = []

    // Try to find matching purchases for cost basis (FIFO)
    const matchingPurchases = purchases
      .filter(p => areSubstantiallyIdentical(sale, p, options.includeOptions))
      .filter(p => p.date.getTime() <= sale.date.getTime()) // purchased before or on the sale date
      .sort((a, b) => a.date.getTime() - b.date.getTime()) // FIFO

    for (const purchase of matchingPurchases) {
      if (remainingSaleQty <= 0) break

      const used = purchaseUsed.get(purchase.id ?? -1) ?? 0
      const available = purchase.qty - used
      if (available > 0) {
        const qtyToUse = Math.min(remainingSaleQty, available)
        const unitPrice = purchase.price > 0 ? purchase.price : (Math.abs(purchase.amount) / purchase.qty)
        
        costBasis += unitPrice * qtyToUse
        
        acquiredTransactions.push({
          id: purchase.id,
          date: purchase.dateStr,
          qty: qtyToUse,
          price: unitPrice,
          description: purchase.description,
        })

        // Track used shares for subsequent sales
        purchaseUsed.set(purchase.id ?? -1, used + qtyToUse)
        remainingSaleQty -= qtyToUse
      }
    }

    // Set dateAcquired. If multiple purchases, it's null (Various)
    if (acquiredTransactions.length === 1) {
      dateAcquired = acquiredTransactions[0]!.date
    } else if (acquiredTransactions.length > 1) {
      dateAcquired = null // "Various"
    }

    // If no matching purchase found or only partial, compute estimate for remainder
    if (remainingSaleQty > 0) {
      // If the sale has a price, use price * qty as cost basis estimate
      costBasis += (sale.price > 0 ? sale.price : 0) * remainingSaleQty
    }

    const rawGainLoss = saleProceeds - costBasis
    const isLoss = rawGainLoss < 0

    // Wash sale detection: only applies to losses
    let isWashSale = false
    let disallowedLoss = 0
    let washPurchaseId: number | undefined = undefined

    if (isLoss) {
      // Look for replacement purchases within the 61-day window
      const washWindowStart = new Date(sale.date)
      washWindowStart.setDate(washWindowStart.getDate() - 30)
      const washWindowEnd = new Date(sale.date)
      washWindowEnd.setDate(washWindowEnd.getDate() + 30)

      const acquiredIds = new Set(acquiredTransactions.map(at => at.id).filter(id => id !== undefined))

      // Sort potential wash purchases by date (prefer closest after the sale)
      const washCandidates = purchases
        .filter(p => areSubstantiallyIdentical(sale, p, options.includeOptions))
        .filter(p => {
          // Must be within the 61-day window
          return p.date >= washWindowStart && p.date <= washWindowEnd
        })
        .filter(p => {
          // The replacement purchase cannot be the same transaction that established the position
          if (p.id !== undefined && acquiredIds.has(p.id)) return false
          return true
        })
        .sort((a, b) => {
          // Prefer purchases after the sale, then by closest date
          const aAfter = a.date >= sale.date ? 0 : 1
          const bAfter = b.date >= sale.date ? 0 : 1
          if (aAfter !== bAfter) return aAfter - bAfter
          return Math.abs(a.date.getTime() - sale.date.getTime()) - Math.abs(b.date.getTime() - sale.date.getTime())
        })

      for (const candidate of washCandidates) {
        const candidateKey = candidate.id ?? -1
        const used = purchaseUsed.get(candidateKey) ?? 0
        const available = candidate.qty - used
        if (available <= 0) continue

        // This is a wash sale
        isWashSale = true
        const washQty = Math.min(sale.qty, available)
        const lossPerShare = Math.abs(rawGainLoss) / sale.qty
        disallowedLoss = lossPerShare * washQty
        washPurchaseId = candidate.id

        // Mark shares as used
        purchaseUsed.set(candidateKey, used + washQty)
        break
      }
    }

    const adjustmentAmount = isWashSale ? disallowedLoss : 0
    const adjustmentCode = isWashSale ? 'W' : ''
    const gainOrLoss = rawGainLoss + adjustmentAmount

    // Determine short-term vs long-term
    let isShortTerm = true
    if (dateAcquired) {
      const acquiredDate = parseDate(dateAcquired)
      const holdingDays = daysBetween(acquiredDate, sale.date)
      isShortTerm = holdingDays <= 365
    }

    results.push({
      description: `${sale.qty} sh. ${sale.symbol}`,
      symbol: sale.symbol,
      dateAcquired,
      acquiredTransactions,
      dateSold: sale.dateStr,
      proceeds: saleProceeds,
      costBasis,
      adjustmentCode,
      adjustmentAmount,
      gainOrLoss,
      isShortTerm,
      quantity: sale.qty,
      saleTransactionId: sale.id,
      washPurchaseTransactionId: washPurchaseId,
      isWashSale,
      originalLoss: isLoss ? rawGainLoss : 0,
      disallowedLoss,
      isShortSale: isShort,
    })
  }

  return results
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
  const summary: LotAnalysisSummary = {
    totalProceeds: 0,
    totalCostBasis: 0,
    totalAdjustments: 0,
    totalGainLoss: 0,
    totalWashSaleDisallowed: 0,
    shortTermGain: 0,
    shortTermLoss: 0,
    longTermGain: 0,
    longTermLoss: 0,
    washSaleCount: 0,
    totalSales: lots.length,
  }

  for (const lot of lots) {
    summary.totalProceeds += lot.proceeds
    summary.totalCostBasis += lot.costBasis
    summary.totalAdjustments += lot.adjustmentAmount
    summary.totalGainLoss += lot.gainOrLoss

    if (lot.isWashSale) {
      summary.washSaleCount++
      summary.totalWashSaleDisallowed += lot.disallowedLoss
    }

    if (lot.isShortTerm) {
      if (lot.gainOrLoss >= 0) {
        summary.shortTermGain += lot.gainOrLoss
      } else {
        summary.shortTermLoss += lot.gainOrLoss
      }
    } else {
      if (lot.gainOrLoss >= 0) {
        summary.longTermGain += lot.gainOrLoss
      } else {
        summary.longTermLoss += lot.gainOrLoss
      }
    }
  }

  return summary
}
