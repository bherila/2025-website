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
  /** The account ID of the sale */
  accountId?: number
  /** The account name of the sale */
  accountName?: string
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
  accountId: number | undefined
  accountName: string | undefined
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
 * Check if a transaction type represents a regular sale of a long position.
 */
function isRegularSale(type: string): boolean {
  const t = type.toLowerCase().trim()
  if (t.includes('sell short') || t.includes('sellshort') || t.includes('sell to open')) return false
  return (t.includes('sell') || t === 'assigned' || t === 'exercised')
}

/**
 * Check if a transaction type represents an opening of a short position.
 */
function isShortOpening(type: string): boolean {
  const t = type.toLowerCase().trim()
  return t.includes('sell short') || t.includes('sellshort') || t.includes('sell to open')
}

/**
 * Check if a transaction type represents a regular purchase (opening long).
 */
function isRegularBuy(type: string): boolean {
  const t = type.toLowerCase().trim()
  if (t.includes('buy to cover') || t.includes('buytocover') || t.includes('buy to close')) return false
  return (t.includes('buy') || t.includes('reinvest'))
}

/**
 * Check if a transaction type represents a closing of a short position (cover buy).
 */
function isShortClosing(type: string): boolean {
  const t = type.toLowerCase().trim()
  return t.includes('buy to cover') || t.includes('buytocover') || t.includes('buy to close')
}

/**
 * For initial filtering: Is it any kind of purchase?
 */
function isBuyType(type: string): boolean {
  return isRegularBuy(type) || isShortClosing(type)
}

/**
 * For initial filtering: Is it any kind of sale?
 */
function isSaleType(type: string): boolean {
  return isRegularSale(type) || isShortOpening(type)
}

/**
 * Is it any kind of opening transaction?
 */
function isOpeningTransaction(type: string): boolean {
  return isRegularBuy(type) || isShortOpening(type)
}

/**
 * Is it any kind of closing transaction?
 */
function isClosingTransaction(type: string): boolean {
  return isRegularSale(type) || isShortClosing(type)
}

/**
 * Check if a transaction type represents a short sale (opening short).
 */
function isShortSaleType(type: string): boolean {
  return isShortOpening(type)
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
        accountId: item.t_account,
        accountName: item.acct_name,
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
  const longPool = parsed.filter(t => isRegularBuy(t.type))
  const shortPool = parsed.filter(t => isShortOpening(t.type))

  // Track how many shares of each transaction have been "used"
  const sharesUsed = new Map<number, number>()

  const rawResults: LotSale[] = []

  // All closing transactions (regular sales of long positions, and cover/close buys of short positions)
  const allClosing = parsed.filter(t => isClosingTransaction(t.type))
  
  // Sort sales by date to process them chronologically
  const sortedSales = [...allClosing].sort((a, b) => a.date.getTime() - b.date.getTime())

  for (const sale of sortedSales) {
    const isClosingShort = isShortClosing(sale.type)
    const isClosingLong = isRegularSale(sale.type)

    let remainingQty = sale.qty
    
    // MATCHING: Find the lots that were closed by this transaction
    // If regular sale, match against longPool (buys)
    // If cover/close buy, match against shortPool (sell shorts)
    const matchingPool = isClosingLong ? longPool : shortPool
    
    const candidates = matchingPool
      .filter(p => areSubstantiallyIdentical(sale, p, options.includeOptions))
      .filter(p => p.date.getTime() <= sale.date.getTime()) // established before or on closing date
      .sort((a, b) => a.date.getTime() - b.date.getTime()) // FIFO

    const stMatches: any[] = []
    const ltMatches: any[] = []

    for (const candidate of candidates) {
      if (remainingQty <= 0) break

      const used = sharesUsed.get(candidate.internalIndex) ?? 0
      const available = candidate.qty - used
      if (available > 0) {
        const qtyToUse = Math.min(remainingQty, available)
        const unitPrice = candidate.price > 0 ? candidate.price : (Math.abs(candidate.amount) / candidate.qty)
        const holdingDays = daysBetween(candidate.date, sale.date)
        const isShortTerm = holdingDays <= 365

        const match = {
          id: candidate.id,
          internalIndex: candidate.internalIndex,
          date: candidate.dateStr,
          qty: qtyToUse,
          price: unitPrice,
          description: candidate.description,
        }

        if (isShortTerm) stMatches.push(match)
        else ltMatches.push(match)

        sharesUsed.set(candidate.internalIndex, used + qtyToUse)
        remainingQty -= qtyToUse
      }
    }

    // Handle remainder (unmatched portions) - assign to ST by default
    const unmatched: any[] = []
    if (remainingQty > 0) {
      unmatched.push({
        id: undefined,
        internalIndex: -1,
        date: null,
        qty: remainingQty,
        price: sale.price > 0 ? sale.price : 0,
        description: 'Unmatched',
      })
    }

    // Process ST and LT portions as separate potential LotSale records
    const portions = [
      { matches: stMatches.concat(unmatched), isShortTerm: true },
      { matches: ltMatches, isShortTerm: false }
    ].filter(p => p.matches.length > 0)

    for (const portion of portions) {
      const portionQty = portion.matches.reduce((sum: number, m: any) => sum + m.qty, 0)
      const portionProceeds = (Math.abs(sale.amount) / sale.qty) * portionQty
      const portionCostBasis = portion.matches.reduce((sum: number, m: any) => sum + (m.price * m.qty), 0)
      const rawGainLoss = portionProceeds - portionCostBasis
      const isLoss = rawGainLoss < 0

      // Wash sale detection for this portion
      let isWashSale = false
      let disallowedLoss = 0
      let washPurchaseId: number | undefined = undefined

      if (isLoss) {
        const washWindowStart = new Date(sale.date)
        washWindowStart.setDate(washWindowStart.getDate() - 30)
        const washWindowEnd = new Date(sale.date)
        washWindowEnd.setDate(washWindowEnd.getDate() + 30)

        const acquiredInternalIndices = new Set(portion.matches.map((m: any) => m.internalIndex))

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
          const washQty = Math.min(portionQty, available)
          disallowedLoss = (Math.abs(rawGainLoss) / portionQty) * washQty
          washPurchaseId = candidate.id
          sharesUsed.set(candidate.internalIndex, used + washQty)
          break
        }
      }

      const adjustmentAmount = isWashSale ? disallowedLoss : 0
      const adjustmentCode = isWashSale ? 'W' : ''
      const gainOrLoss = rawGainLoss + adjustmentAmount

      let dateAcquired: string | null = null
      const actualMatches = portion.matches.filter((m: any) => m.internalIndex !== -1)
      if (actualMatches.length === 1) {
        dateAcquired = actualMatches[0].date
      } else if (actualMatches.length > 1) {
        dateAcquired = null // "Various"
      }

      rawResults.push({
        description: `${portionQty} sh. ${sale.symbol}`,
        symbol: sale.symbol,
        accountId: sale.accountId,
        accountName: sale.accountName,
        dateAcquired,
        acquiredTransactions: actualMatches,
        dateSold: sale.dateStr,
        proceeds: portionProceeds,
        costBasis: portionCostBasis,
        adjustmentCode,
        adjustmentAmount,
        gainOrLoss,
        isShortTerm: portion.isShortTerm,
        quantity: portionQty,
        saleTransactionId: sale.id,
        washPurchaseTransactionId: washPurchaseId,
        isWashSale,
        originalLoss: isLoss ? rawGainLoss : 0,
        disallowedLoss,
        isShortSale: isClosingShort,
      })
    }
  }

  // Merge records on the same date with the same term and adjustment code
  return mergeLotSales(rawResults)
}

/**
 * Merge LotSale records that occurred on the same day and have the same term/adjustments.
 */
function mergeLotSales(lots: LotSale[]): LotSale[] {
  const merged: Map<string, LotSale> = new Map()

  for (const lot of lots) {
    // Key for grouping: symbol, dateSold, term, shortSale status, adjustment code, AND accountId
    const key = `${lot.symbol}|${lot.dateSold}|${lot.isShortTerm}|${lot.isShortSale}|${lot.adjustmentCode}|${lot.accountId}`
    
    const existing = merged.get(key)
    if (existing) {
      existing.quantity += lot.quantity
      existing.proceeds += lot.proceeds
      existing.costBasis += lot.costBasis
      existing.adjustmentAmount += lot.adjustmentAmount
      existing.gainOrLoss += lot.gainOrLoss
      existing.originalLoss += lot.originalLoss
      existing.disallowedLoss += lot.disallowedLoss
      existing.description = `${existing.quantity} sh. ${existing.symbol}`
      
      // Update date acquired
      if (existing.dateAcquired !== lot.dateAcquired) {
        existing.dateAcquired = null // Becomes "Various"
      }
      
      // Merge acquired transactions
      if (lot.acquiredTransactions) {
        existing.acquiredTransactions = (existing.acquiredTransactions || []).concat(lot.acquiredTransactions)
      }
    } else {
      // Clone to avoid mutating original
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
