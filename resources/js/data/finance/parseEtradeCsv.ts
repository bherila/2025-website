import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { parseDate } from '@/lib/DateHelper'
import { z } from 'zod'

export function parseEtradeCsv(text: string): AccountLineItem[] {
  const lines = text.split('\n')
  const data: AccountLineItem[] = []

  if (lines.length < 2 || !lines[0].startsWith('"Date","Transaction type","Description","Quantity","Price","Commission","Fees","Amount"')) {
    return data
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) {
      continue
    }

    const columns = line.split(',').map((col) => col.replace(/"/g, '').trim())
    if (columns.length < 8) {
      continue
    }

    try {
      const item = AccountLineItemSchema.parse({
        t_date: parseDate(columns[0])?.formatYMD() ?? columns[0],
        t_type: columns[1],
        t_description: columns[2],
        t_qty: parseFloat(columns[3]) || undefined,
        t_price: columns[4],
        t_commission: columns[5],
        t_fee: columns[6],
        t_amt: columns[7],
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
