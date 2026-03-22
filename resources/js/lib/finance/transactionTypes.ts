export const TRANSACTION_TYPES = [
  'Buy',
  'Sell',
  'Buy (Covered)',
  'Buy (Opening)',
  'Sell (Covered)',
  'Sell (Opening)',
  'Dividend',
  'Interest',
  'Fee',
  'Transfer',
  'Deposit',
  'Withdrawal',
  'Option Assignment',
  'Option Exercise',
  'Option Expiration',
  'Stock Split',
  'Reinvestment',
  'Other',
]

const PINNED_TRANSACTION_TYPES = ['Deposit', 'Withdrawal', 'Transfer']

export const transactionTypesWithPinnedTop = (): string[] => {
  const deduped = Array.from(new Set(TRANSACTION_TYPES))
  const remaining = deduped.filter((type) => !PINNED_TRANSACTION_TYPES.includes(type))

  return [...PINNED_TRANSACTION_TYPES, ...remaining]
}
