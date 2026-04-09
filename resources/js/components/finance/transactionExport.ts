import type { AccountLineItem } from '@/data/finance/AccountLineItem'

export function exportToCSV(data: AccountLineItem[], accountId: number | 'all', selectedYear: string): void {
  if (data.length === 0) return
  const headers = ['Date', 'Type', 'Description', 'Symbol', 'Amount', 'Qty', 'Price', 'Commission', 'Fee', 'Memo']
  const csvContent = [
    headers.join(','),
    ...data.map((t) =>
      [
        t.t_date || '',
        `"${(t.t_type || '').replace(/"/g, '""')}"`,
        `"${(t.t_description || '').replace(/"/g, '""')}"`,
        t.t_symbol || '',
        t.t_amt || '',
        t.t_qty || '',
        t.t_price || '',
        t.t_commission || '',
        t.t_fee || '',
        `"${(t.t_comment || '').replace(/"/g, '""')}"`,
      ].join(','),
    ),
  ].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `transactions_${accountId}_${selectedYear}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

export function exportToJSON(data: AccountLineItem[], accountId: number | 'all', selectedYear: string): void {
  if (data.length === 0) return
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `transactions_${accountId}_${selectedYear}.json`
  link.click()
  URL.revokeObjectURL(link.href)
}
