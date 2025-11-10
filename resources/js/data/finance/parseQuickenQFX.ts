import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { parseDate } from '@/lib/DateHelper'
import { z } from 'zod'

export function parseQuickenQFX(text: string): AccountLineItem[] {
  const data: AccountLineItem[] = []

  if (!text.includes('<OFX>')) {
    return data
  }

  const transactions = text.split('<STMTTRN>')
  transactions.shift() // Remove header

  for (const transaction of transactions) {
    const typeMatch = transaction.match(/<TRNTYPE>([^<]+)/)
    const dateMatch = transaction.match(/<DTPOSTED>([^<]+)/)
    const amountMatch = transaction.match(/<TRNAMT>([^<]+)/)
    const descriptionMatch = transaction.match(/<MEMO>([^<]+)/)

    if (typeMatch && dateMatch && amountMatch && descriptionMatch) {
      try {
        const item = AccountLineItemSchema.parse({
          t_date: parseDate(dateMatch[1])?.formatYMD() ?? dateMatch[1],
          t_type: typeMatch[1],
          t_description: descriptionMatch[1],
          t_amt: amountMatch[1],
        })
        data.push(item)
      } catch (e) {
        if (e instanceof z.ZodError) {
          console.error('Error parsing QFX transaction:', e.errors)
        } else {
          console.error('Error parsing QFX transaction:', e)
        }
      }
    }
  }

  return data
}
