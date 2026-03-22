export function formatFriendlyAmount(amount: number): string {
  const absAmount = Math.abs(amount)
  if (absAmount >= 1000000) {
    const millions = amount / 1000000
    return millions % 1 === 0 ? `${millions}m` : `${millions.toFixed(1)}m`
  } else if (absAmount >= 1000) {
    const thousands = amount / 1000
    return thousands % 1 === 0 ? `${thousands}k` : `${thousands.toFixed(1)}k`
  }
  return amount.toFixed(0)
}

export function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}
