import type { AccountLineItem } from './AccountLineItem'

/**
 * Checks if a transaction is a duplicate of any transaction in the existing transactions list.
 * A transaction is considered a duplicate if it matches on:
 * - t_date
 * - t_type (partial match)
 * - t_description (partial match)
 * - t_qty (exact match, defaults to 0)
 * - t_amt (exact match)
 */
export function isDuplicateTransaction(
  transaction: AccountLineItem,
  existingTransactions: AccountLineItem[]
): boolean {
  return existingTransactions.some(
    (existing) =>
      existing.t_date === transaction.t_date &&
      (existing.t_type ?? '').includes(transaction.t_type ?? '') &&
      (existing.t_description ?? '').includes(transaction.t_description ?? '') &&
      (existing.t_qty ?? 0) === (transaction.t_qty ?? 0) &&
      existing.t_amt === transaction.t_amt
  )
}

/**
 * Filters an array of transactions and returns only those that are duplicates
 * of existing transactions.
 */
export function findDuplicateTransactions(
  transactions: AccountLineItem[],
  existingTransactions: AccountLineItem[]
): AccountLineItem[] {
  return transactions.filter((item) =>
    isDuplicateTransaction(item, existingTransactions)
  )
}

/**
 * Filters an array of transactions and returns only those that are NOT duplicates
 * of existing transactions.
 */
export function filterOutDuplicates(
  transactions: AccountLineItem[],
  existingTransactions: AccountLineItem[]
): AccountLineItem[] {
  return transactions.filter((item) =>
    !isDuplicateTransaction(item, existingTransactions)
  )
}
