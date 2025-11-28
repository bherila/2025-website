import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { parseDate } from '@/lib/DateHelper'
import { z } from 'zod'

interface FidelityColumnMapping {
  dateCol: number
  actionCol: number
  symbolCol: number
  descriptionCol: number
  quantityCol: number
  priceCol: number
  commissionCol: number
  feesCol: number
  amountCol: number
  settlementDateCol: number
  cashBalanceCol?: number | undefined
}

function parseHeader(header: string): FidelityColumnMapping | null {
  const columns = header.split(',').map((col) => col.trim())

  // Find the date column (accept both "Run Date" and "Date")
  const dateCol = columns.findIndex((col) => col === 'Run Date' || col === 'Date')
  if (dateCol === -1) return null

  // Find other required columns
  const actionCol = columns.findIndex((col) => col === 'Action')
  const symbolCol = columns.findIndex((col) => col === 'Symbol')
  const descriptionCol = columns.findIndex((col) => col === 'Security Description' || col === 'Description')
  const quantityCol = columns.findIndex((col) => col === 'Quantity')
  const priceCol = columns.findIndex((col) => col === 'Price ($)')
  const commissionCol = columns.findIndex((col) => col === 'Commission ($)')
  const feesCol = columns.findIndex((col) => col === 'Fees ($)')
  const amountCol = columns.findIndex((col) => col === 'Amount ($)')
  const settlementDateCol = columns.findIndex((col) => col === 'Settlement Date')
  const cashBalanceCol = columns.findIndex((col) => col === 'Cash Balance ($)')

  // Validate required columns exist
  if (actionCol === -1 || amountCol === -1) return null

  return {
    dateCol,
    actionCol,
    symbolCol,
    descriptionCol,
    quantityCol,
    priceCol,
    commissionCol,
    feesCol,
    amountCol,
    settlementDateCol,
    cashBalanceCol: cashBalanceCol !== -1 ? cashBalanceCol : undefined,
  }
}

import { splitDelimitedText } from '@/lib/splitDelimitedText'

export function parseFidelityCsv(text: string): AccountLineItem[] {
  const data: AccountLineItem[] = []

  // Use the robust CSV parser, which handles quoted fields and newlines
  const rows = splitDelimitedText(text, ',')

  if (rows.length < 2 || !rows[0]) {
    return data
  }

  // The header needs to be a string for parseHeader
  const mapping = parseHeader(rows[0].join(','))
  if (!mapping) {
    return data
  }

  for (let i = 1; i < rows.length; i++) {
    const columns = rows[i]
    if (!columns) continue

    // Basic validation to skip malformed/disclaimer lines that don't have enough columns
    if (columns.length < Math.max(mapping.dateCol, mapping.actionCol, mapping.amountCol)) {
        continue;
    }

    try {
      const settlementDate = mapping.settlementDateCol !== -1 ? columns[mapping.settlementDateCol] : undefined
      const cashBalance = mapping.cashBalanceCol !== undefined ? columns[mapping.cashBalanceCol] : undefined

      const item = AccountLineItemSchema.parse({
        t_date: parseDate(columns[mapping.dateCol] ?? '')?.formatYMD() ?? columns[mapping.dateCol],
        t_type: columns[mapping.actionCol],
        t_symbol: mapping.symbolCol !== -1 ? columns[mapping.symbolCol] || undefined : undefined,
        t_description: mapping.descriptionCol !== -1 ? columns[mapping.descriptionCol] : undefined,
        t_qty: mapping.quantityCol !== -1 ? parseFloat(columns[mapping.quantityCol] ?? '') || undefined : undefined,
        t_price: mapping.priceCol !== -1 ? columns[mapping.priceCol] : undefined,
        t_commission: mapping.commissionCol !== -1 ? columns[mapping.commissionCol] : undefined,
        t_fee: mapping.feesCol !== -1 ? columns[mapping.feesCol] : undefined,
        t_amt: columns[mapping.amountCol],
        t_account_balance: cashBalance,
        t_date_posted: settlementDate && settlementDate !== 'Processing' ? (parseDate(settlementDate)?.formatYMD() ?? settlementDate) : undefined,
      })
      data.push(item)
    } catch (e) {
      // The Zod schema is now robust enough to handle most bad data, but we'll log errors for debugging.
      if (e instanceof z.ZodError) {
        // console.error(`Error parsing line ${i + 1} (potential malformed data or unexpected disclaimer): ${columns.join(',')}`, e.errors)
      } else {
        // console.error(`Error parsing line ${i + 1} (potential malformed data or unexpected disclaimer): ${columns.join(',')}`, e)
      }
      continue
    }
  }

  return data
}
