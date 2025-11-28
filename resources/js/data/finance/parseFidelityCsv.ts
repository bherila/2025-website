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
  }
}

export function parseFidelityCsv(text: string): AccountLineItem[] {
  const lines = text.split('\n')
  const data: AccountLineItem[] = []

  if (lines.length < 2 || !lines[0]) {
    return data
  }

  const mapping = parseHeader(lines[0])
  if (!mapping) {
    return data
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) {
      continue
    }

    const columns = line.split(',').map((col) => col.replace(/"/g, '').trim())

    try {
      const settlementDate = mapping.settlementDateCol !== -1 ? columns[mapping.settlementDateCol] : undefined
      const item = AccountLineItemSchema.parse({
        t_date: parseDate(columns[mapping.dateCol])?.formatYMD() ?? columns[mapping.dateCol],
        t_type: columns[mapping.actionCol],
        t_symbol: mapping.symbolCol !== -1 ? columns[mapping.symbolCol] || undefined : undefined,
        t_description: mapping.descriptionCol !== -1 ? columns[mapping.descriptionCol] : undefined,
        t_qty: mapping.quantityCol !== -1 ? parseFloat(columns[mapping.quantityCol]) || undefined : undefined,
        t_price: mapping.priceCol !== -1 ? columns[mapping.priceCol] : undefined,
        t_commission: mapping.commissionCol !== -1 ? columns[mapping.commissionCol] : undefined,
        t_fee: mapping.feesCol !== -1 ? columns[mapping.feesCol] : undefined,
        t_amt: columns[mapping.amountCol],
        t_date_posted: settlementDate && settlementDate !== 'Processing' ? (parseDate(settlementDate)?.formatYMD() ?? settlementDate) : undefined,
      })
      data.push(item)
    } catch (e) {
      if (e instanceof z.ZodError) {
        console.error(`Error parsing line ${i + 1}: ${line}`, e.errors)
      } else {
        console.error(`Error parsing line ${i + 1}: ${line}`, e)
      }
    }
  }

  return data
}
