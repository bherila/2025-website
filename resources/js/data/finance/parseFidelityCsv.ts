import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { parseDate } from '@/lib/DateHelper'
import { z } from 'zod'

export function parseFidelityCsv(text: string): AccountLineItem[] {
  const lines = text.split('\n')
  const data: AccountLineItem[] = []

  if (lines.length < 2 || !lines[0].startsWith('Run Date,Account,Action,Symbol,Security Description,Security Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date')) {
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
      const item = AccountLineItemSchema.parse({
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
