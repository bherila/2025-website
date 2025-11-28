import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { parseDate } from '@/lib/DateHelper'
import { z } from 'zod'

// Old format header: Run Date,Account,Action,Symbol,Security Description,Security Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
// New format header: Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date

type FidelityFormat = 'old' | 'new' | 'unknown'

function detectFormat(header: string): FidelityFormat {
  if (header.startsWith('Run Date,Account,Action,Symbol,Security Description,Security Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date')) {
    return 'old'
  }
  if (header.startsWith('Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date')) {
    return 'new'
  }
  return 'unknown'
}

export function parseFidelityCsv(text: string): AccountLineItem[] {
  const lines = text.split('\n')
  const data: AccountLineItem[] = []

  if (lines.length < 2 || !lines[0]) {
    return data
  }

  const format = detectFormat(lines[0])
  if (format === 'unknown') {
    return data
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) {
      continue
    }

    const columns = line.split(',').map((col) => col.replace(/"/g, '').trim())
    if (columns.length < 13) {
      continue
    }

    try {
      let item: AccountLineItem
      if (format === 'old') {
        // Old format columns:
        // 0: Run Date, 1: Account, 2: Action, 3: Symbol, 4: Security Description, 5: Security Type
        // 6: Quantity, 7: Price ($), 8: Commission ($), 9: Fees ($), 10: Accrued Interest ($), 11: Amount ($), 12: Settlement Date
        item = AccountLineItemSchema.parse({
          t_date: parseDate(columns[0])?.formatYMD() ?? columns[0],
          t_type: columns[2],
          t_symbol: columns[3],
          t_description: columns[4],
          t_qty: parseFloat(columns[6]) || undefined,
          t_price: columns[7],
          t_commission: columns[8],
          t_fee: columns[9],
          t_amt: columns[11],
          t_date_posted: parseDate(columns[12])?.formatYMD() ?? columns[12],
        })
      } else {
        // New format columns:
        // 0: Date, 1: Action, 2: Symbol, 3: Description, 4: Type
        // 5: Quantity, 6: Price ($), 7: Commission ($), 8: Fees ($), 9: Accrued Interest ($), 10: Amount ($), 11: Cash Balance ($), 12: Settlement Date
        const settlementDate = columns[12]
        item = AccountLineItemSchema.parse({
          t_date: parseDate(columns[0])?.formatYMD() ?? columns[0],
          t_type: columns[1],
          t_symbol: columns[2] || undefined,
          t_description: columns[3],
          t_qty: parseFloat(columns[5]) || undefined,
          t_price: columns[6],
          t_commission: columns[7],
          t_fee: columns[8],
          t_amt: columns[10],
          t_date_posted: settlementDate && settlementDate !== 'Processing' ? (parseDate(settlementDate)?.formatYMD() ?? settlementDate) : undefined,
        })
      }
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
