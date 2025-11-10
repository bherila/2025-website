import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { parseDate } from '@/lib/DateHelper'
import { z } from 'zod'

export function parseWealthfrontHAR(text: string): AccountLineItem[] {
  const data: AccountLineItem[] = []

  try {
    const har = JSON.parse(text)
    const entries = har.log.entries

    for (const entry of entries) {
      if (entry.request.url.includes('https://api.wealthfront.com/v1/history')) {
        const responseContent = entry.response.content.text
        const responseData = JSON.parse(responseContent)

        for (const item of responseData) {
          try {
            const parsedItem = AccountLineItemSchema.parse({
              t_date: parseDate(item.date)?.formatYMD() ?? item.date,
              t_type: item.type,
              t_description: item.title.long,
              t_amt: item.amount,
              t_symbol: item.symbol,
              t_qty: item.quantity,
              t_price: item.price,
            })
            data.push(parsedItem)
          } catch (e) {
            if (e instanceof z.ZodError) {
              console.error('Error parsing HAR item:', e.errors)
            } else {
              console.error('Error parsing HAR item:', e)
            }
          }
        }
      }
    }
  } catch (e) {
    // Not a valid HAR file, or structure is different
  }

  return data
}
