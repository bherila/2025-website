import { z } from 'zod'

import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { parseDate } from '@/lib/DateHelper'

function getOfxField(transaction: string, fieldName: string): string | null {
  const regex = new RegExp(`<${fieldName}>([^<]+)`)
  const match = transaction.match(regex)
  return match && match[1] ? match[1].trim() : null
}

function normalizeOfxDate(rawDate: string): string {
  const compactDateMatch = rawDate.match(/^(\d{4})(\d{2})(\d{2})/)
  if (compactDateMatch) {
    const [, year, month, day] = compactDateMatch
    return `${year}-${month}-${day}`
  }

  return parseDate(rawDate)?.formatYMD() ?? rawDate
}

function decodeOfxEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

export function parseQuickenQFX(text: string): AccountLineItem[] {
  const data: AccountLineItem[] = []

  if (!text.includes('<OFX>')) {
    return data
  }

  const transactions = text.split('<STMTTRN>')
  transactions.shift() // Remove header

  for (const transaction of transactions) {
    const type = getOfxField(transaction, 'TRNTYPE')
    const postedDate = getOfxField(transaction, 'DTPOSTED')
    const amount = getOfxField(transaction, 'TRNAMT')
    const name = getOfxField(transaction, 'NAME')
    const memo = getOfxField(transaction, 'MEMO')
    const description = name ?? memo

    if (type && postedDate && amount && description) {
      try {
        const parsedPostedDate = normalizeOfxDate(postedDate)
        const item = AccountLineItemSchema.parse({
          t_date: parsedPostedDate,
          t_date_posted: parsedPostedDate,
          t_type: type,
          t_description: decodeOfxEntities(description),
          t_comment: memo ? decodeOfxEntities(memo) : undefined,
          t_amt: amount,
        })
        data.push(item)
      } catch (e) {
        if (e instanceof z.ZodError) {
          console.error('Error parsing QFX transaction:', e.issues)
        } else {
          console.error('Error parsing QFX transaction:', e)
        }
      }
    }
  }

  return data
}
