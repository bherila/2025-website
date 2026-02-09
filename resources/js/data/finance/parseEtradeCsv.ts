import { z } from 'zod'

import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { parseDate } from '@/lib/DateHelper'

import { parseOptionDescription } from './StockOptionUtil'

export function parseEtradeCsv(text: string): AccountLineItem[] {
  const lines = text.split('\n')
  const data: AccountLineItem[] = []

  if (lines.length === 0) return data

  // Known header variants
  const headerV1 = '"Date","Transaction type","Description","Quantity","Price","Commission","Fees","Amount"'
  const headerV2 = 'TransactionDate,TransactionType,SecurityType,Symbol,Quantity,Amount,Price,Commission,Description'

  // Find the header line index (skip preamble like "For Account:")
  let headerIndex = -1
  let headerType: 'v1' | 'v2' | null = null
  for (const [i, lRaw] of lines.entries()) {
    const l = lRaw.trim()
    if (!l) continue
    if (l.startsWith(headerV1)) {
      headerIndex = i
      headerType = 'v1'
      break
    }
    if (l.startsWith(headerV2)) {
      headerIndex = i
      headerType = 'v2'
      break
    }
  }

  if (headerIndex === -1 || headerType === null) {
    return data
  }

  // Parse rows after header using entries() to avoid lines[i] possibly undefined
  for (const [offset, rawLine] of lines.slice(headerIndex + 1).entries()) {
    if (!rawLine || !rawLine.trim()) continue

    // Simple CSV split (inputs here don't contain embedded commas with quotes in examples)
    const cols = rawLine.split(',').map((c) => c.replace(/"/g, '').trim())

    try {
      if (headerType === 'v1') {
        // Expected columns: Date, Transaction type, Description, Quantity, Price, Commission, Fees, Amount
        if (cols.length < 8) continue
        const item = AccountLineItemSchema.parse({
          t_date: parseDate(cols[0])?.formatYMD() ?? cols[0],
          t_type: cols[1] || undefined,
          t_description: cols[2] || undefined,
          t_qty: cols[3] ? parseFloat(cols[3]) : undefined,
          t_price: cols[4] ?? undefined,
          t_commission: cols[5] ?? undefined,
          t_fee: cols[6] ?? undefined,
          t_amt: cols[7] ?? undefined,
        })
        data.push(item)
      } else if (headerType === 'v2') {
        // Expected columns: TransactionDate,TransactionType,SecurityType,Symbol,Quantity,Amount,Price,Commission,Description
        if (cols.length < 9) continue
        const symbolCandidate = cols[3] || ''
        let symbol: string | undefined = symbolCandidate || undefined
        if (symbol && (symbol.length > 20 || symbol.includes(' '))) {
          const opt = parseOptionDescription(symbolCandidate) || parseOptionDescription(cols[8] || '')
          if (opt?.symbol) {
            symbol = opt.symbol
          } else {
            const m = symbolCandidate.match(/^[A-Z]{1,20}/)
            if (m) symbol = m[0]
          }
        }
        const item = AccountLineItemSchema.parse({
          t_date: parseDate(cols[0])?.formatYMD() ?? cols[0],
          t_type: cols[1] || undefined,
          t_description: cols[8] || undefined,
          t_symbol: symbol,
          t_qty: cols[4] ? parseFloat(cols[4]) : undefined,
          t_amt: cols[5] ?? undefined,
          t_price: cols[6] ?? undefined,
          t_commission: cols[7] ?? undefined,
        })
        data.push(item)
      }
    } catch (e) {
      if (e instanceof z.ZodError) {
        console.error(`Error parsing line ${headerIndex + 2 + offset}: ${rawLine}`, e.issues)
      } else {
        console.error(`Error parsing line ${headerIndex + 2 + offset}: ${rawLine}`, e)
      }
      continue
    }
  }

  return data
}
