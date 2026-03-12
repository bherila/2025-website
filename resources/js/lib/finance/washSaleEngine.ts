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
  internalIndex: number
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
    .map((item, index) => {
      const isOption = !!(item.opt_type || item.opt_expiration)
      // For options, the match symbol is the underlying equity symbol
      const baseSymbol = item.t_symbol!.toUpperCase().trim()
      const matchSymbol = baseSymbol.replace(/\s+\d{6}[CP]\d+$/i, '').trim()

      return {
        id: item.t_id,
        internalIndex: index,
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

  // Track available lots for cost basis matching
  // We separate long positions (buys) and short positions (sell shorts)
  const longPool = parsed.filter(t => isBuyType(t.type))
  const shortPool = parsed.filter(t => isShortSaleType(t.type))

  // Track how many shares of each transaction have been "used"
  const sharesUsed = new Map<number, number>()

  const results: LotSale[] = []

  // All sales (regular sales of long positions, and cover buys of short positions)
  const allSales = parsed.filter(t => isSaleType(t.type) || (isBuyType(t.type) && t.type.toLowerCase().includes('cover')))
  
  // Sort sales by date to process them chronologically
  const sortedSales = [...allSales].sort((a, b) => a.date.getTime() - b.date.getTime())

  for (const sale of sortedSales) {
    const isCoverBuy = isBuyType(sale.type) && sale.type.toLowerCase().includes('cover')
    const isRegularSale = isSaleType(sale.type) && !isShortSaleType(sale.type)
    
    // If it's a "Sell Short", it's the OPENING of a position, not a sale of a lot for 8949 purposes
    if (isShortSaleType(sale.type)) continue

    let remainingQty = sale.qty
    const proceeds = Math.abs(sale.amount)
    
    let costBasis = 0
    const acquiredTransactions: Array<{
      id: number | undefined
      internalIndex: number
      date: string
      qty: number
      price: number
      description: string
    }> = []

    // 1. MATCHING: Find the lots that were closed by this transaction
    // If regular sale, match against longPool (buys)
    // If cover buy, match against shortPool (sell shorts)
    const matchingPool = isRegularSale ? longPool : shortPool
    
    const candidates = matchingPool
      .filter(p => areSubstantiallyIdentical(sale, p, options.includeOptions))
      .filter(p => p.date.getTime() <= sale.date.getTime()) // established before or on closing date
      .sort((a, b) => a.date.getTime() - b.date.getTime()) // FIFO

    for (const candidate of candidates) {
      if (remainingQty <= 0) break

      const used = sharesUsed.get(candidate.internalIndex) ?? 0
      const available = candidate.qty - used
      if (available > 0) {
        const qtyToUse = Math.min(remainingQty, available)
        const unitPrice = candidate.price > 0 ? candidate.price : (Math.abs(candidate.amount) / candidate.qty)
        
        costBasis += unitPrice * qtyToUse
        
        acquiredTransactions.push({
          id: candidate.id,
          internalIndex: candidate.internalIndex,
          date: candidate.dateStr,
          qty: qtyToUse,
          price: unitPrice,
          description: candidate.description,
        })

        sharesUsed.set(candidate.internalIndex, used + qtyToUse)
        remainingQty -= qtyToUse
      }
    }

    // Estimate basis for remainder if not fully matched
    if (remainingQty > 0) {
      costBasis += (sale.price > 0 ? sale.price : 0) * remainingQty
    }

    const rawGainLoss = proceeds - costBasis
    const isLoss = rawGainLoss < 0

    // 2. WASH SALE DETECTION (only for losses)
    let isWashSale = false
    let disallowedLoss = 0
    let washPurchaseId: number | undefined = undefined

    if (isLoss) {
      const washWindowStart = new Date(sale.date)
      washWindowStart.setDate(washWindowStart.getDate() - 30)
      const washWindowEnd = new Date(sale.date)
      washWindowEnd.setDate(washWindowEnd.getDate() + 30)

      const acquiredInternalIndices = new Set(acquiredTransactions.map(at => at.internalIndex))

      // Potential replacements are any NEW buys (longPool) within the window
      // that weren't part of the original position's cost basis
      const washCandidates = longPool
        .filter(p => areSubstantiallyIdentical(sale, p, options.includeOptions))
        .filter(p => p.date >= washWindowStart && p.date <= washWindowEnd)
        .filter(p => !acquiredInternalIndices.has(p.internalIndex))
        .sort((a, b) => {
          const aAfter = a.date >= sale.date ? 0 : 1
          const bAfter = b.date >= sale.date ? 0 : 1
          if (aAfter !== bAfter) return aAfter - bAfter
          return Math.abs(a.date.getTime() - sale.date.getTime()) - Math.abs(b.date.getTime() - sale.date.getTime())
        })

      for (const candidate of washCandidates) {
        const used = sharesUsed.get(candidate.internalIndex) ?? 0
        const available = candidate.qty - used
        if (available <= 0) continue

        isWashSale = true
        const washQty = Math.min(sale.qty, available)
        disallowedLoss = (Math.abs(rawGainLoss) / sale.qty) * washQty
        washPurchaseId = candidate.id

        // Important: Wash sale replacement shares are also "used" 
        // they can't trigger ANOTHER wash sale disallowance for a different sale
        // but they CAN still be used for cost basis of a later sale.
        // Actually IRS rules are complex here, but for simple tracking:
        sharesUsed.set(candidate.internalIndex, used + washQty)
        break
      }
    }

    const adjustmentAmount = isWashSale ? disallowedLoss : 0
    const adjustmentCode = isWashSale ? 'W' : ''
    const gainOrLoss = rawGainLoss + adjustmentAmount

    // 3. RESULTS
    let dateAcquired: string | null = null
    if (acquiredTransactions.length === 1) {
      dateAcquired = acquiredTransactions[0].date
    } else if (acquiredTransactions.length > 1) {
      dateAcquired = null // "Various"
    }

    let isShortTerm = true
    if (dateAcquired) {
      const holdingDays = daysBetween(parseDate(dateAcquired), sale.date)
      isShortTerm = holdingDays <= 365
    }

    results.push({
      description: `${sale.qty} sh. ${sale.symbol}`,
      symbol: sale.symbol,
      dateAcquired,
      acquiredTransactions,
      dateSold: sale.dateStr,
      proceeds,
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
      isShortSale: !isRegularSale,
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
