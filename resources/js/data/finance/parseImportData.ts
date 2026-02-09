/**
 * Unified import data parser for the finance import page.
 * Tries multiple parsers in sequence to determine the file format.
 */
import { ZodError } from 'zod'

import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { parseEtradeCsv } from '@/data/finance/parseEtradeCsv'
import { parseFidelityCsv } from '@/data/finance/parseFidelityCsv'
import { type IbStatementData,parseIbCsv } from '@/data/finance/parseIbCsv'
import { parseQuickenQFX } from '@/data/finance/parseQuickenQFX'
import { parseWealthfrontHAR } from '@/data/finance/parseWealthfrontHAR'
import { parseDate } from '@/lib/DateHelper'
import { splitDelimitedText } from '@/lib/splitDelimitedText'

export interface ParseImportDataResult {
  /** Parsed transaction data, or null if no valid transactions found */
  data: AccountLineItem[] | null
  /** IB statement data (NAV, positions, performance), or null if not IB format */
  statement: IbStatementData | null
  /** Parse error message, or null if parsing succeeded */
  parseError: string | null
}

/**
 * Parse imported text data from various financial file formats.
 * Tries each parser in sequence until one succeeds:
 * 1. E-Trade CSV
 * 2. QFX/OFX (Quicken)
 * 3. Wealthfront HAR
 * 4. Fidelity CSV
 * 5. Interactive Brokers CSV (includes statement data)
 * 6. Generic CSV with Date/Description/Amount columns
 * 
 * @param text - The raw text content to parse
 * @returns Parsed data with transactions, optional statement data, and any errors
 */
export function parseImportData(text: string): ParseImportDataResult {
  // Try parsing as ETrade CSV
  const eTradeData = parseEtradeCsv(text)
  if (eTradeData.length > 0) {
    return { data: eTradeData, statement: null, parseError: null }
  }

  // Try parsing as QFX
  const qfxData = parseQuickenQFX(text)
  if (qfxData.length > 0) {
    return { data: qfxData, statement: null, parseError: null }
  }

  // Try parsing as Wealthfront HAR
  const wealthfrontData = parseWealthfrontHAR(text)
  if (wealthfrontData.length > 0) {
    return { data: wealthfrontData, statement: null, parseError: null }
  }

  // Try parsing as Fidelity
  const fidelityData = parseFidelityCsv(text)
  if (fidelityData.length > 0) {
    return { data: fidelityData, statement: null, parseError: null }
  }

  // Try parsing as IB (includes statement data)
  const ibResult = parseIbCsv(text)
  if (ibResult.trades.length > 0 || ibResult.statement.positions.length > 0) {
    // Combine trades, interest, and fees into one array
    const allTransactions = [
      ...ibResult.trades,
      ...ibResult.interest,
      ...ibResult.fees,
    ]
    // Check if we have meaningful statement data
    const hasStatementData = ibResult.statement.positions.length > 0 || 
      ibResult.statement.nav.length > 0 || 
      ibResult.statement.performance.length > 0
    return { 
      data: allTransactions.length > 0 ? allTransactions : null, 
      statement: hasStatementData ? ibResult.statement : null, 
      parseError: null 
    }
  }

  // Fallback: try parsing as generic CSV with common headers
  return parseGenericCsv(text)
}

/**
 * Parse a generic CSV with common transaction headers.
 * Looks for columns: Date, Description, Amount, and optionally
 * Post Date, Comment, Type, Category, Cash Balance.
 */
function parseGenericCsv(text: string): ParseImportDataResult {
  const data: AccountLineItem[] = []
  let parseError: string | null = null
  
  try {
    const lines = splitDelimitedText(text)
    if (lines.length > 1 && lines[0]) {
      const getColumnIndex = (...headers: string[]) => {
        const firstLine = lines[0]!.map((cell) => cell.trim())
        const index = firstLine.findIndex(h => headers.includes(h))
        return index !== -1 ? index : null
      }

      const dateColIndex = getColumnIndex('Date', 'Transaction Date', 'date')
      const postDateColIndex = getColumnIndex('Post Date', 'As of', 'As of Date', 'Settlement Date', 'Date Settled', 'Settled')
      const descriptionColIndex = getColumnIndex('Description', 'Desc', 'description')
      const amountColIndex = getColumnIndex('Amount', 'Amt', 'amount')
      const commentColIndex = getColumnIndex('Comment', 'Memo', 'memo')
      const typeColIndex = getColumnIndex('Type', 'type')
      const categoryColIndex = getColumnIndex('Category')
      const accountBalanceColIndex = getColumnIndex('Cash Balance ($)')

      if (dateColIndex !== null && descriptionColIndex !== null && amountColIndex !== null) {
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i]
          if (row && row[dateColIndex]) {
            data.push(
              AccountLineItemSchema.parse({
                t_date: parseDate(row[dateColIndex]!)?.formatYMD() ?? row[dateColIndex]!,
                t_date_posted: postDateColIndex !== null && row[postDateColIndex] ? parseDate(row[postDateColIndex]!)?.formatYMD() : undefined,
                t_description: row[descriptionColIndex]!,
                t_amt: row[amountColIndex]!,
                t_account_balance: accountBalanceColIndex !== null ? row[accountBalanceColIndex] : undefined,
                t_comment: commentColIndex !== null ? row[commentColIndex] : undefined,
                t_type: typeColIndex !== null ? row[typeColIndex] : undefined,
                t_schc_category: categoryColIndex !== null ? row[categoryColIndex] : undefined,
              }),
            )
          }
        }
      }
    }
  } catch (e) {
    parseError = e instanceof ZodError ? e.message : (e as Error).toString()
  }
  
  return { data: data.length > 0 ? data : null, statement: null, parseError }
}
