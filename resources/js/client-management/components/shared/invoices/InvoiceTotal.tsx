import currency from 'currency.js'

interface InvoiceTotalProps {
  value: number | string
  /** 'admin' uses currency.js format() ($1,234.00). 'portal' uses $1,234.00 via currency.js too. */
  variant?: 'admin' | 'portal'
}

/**
 * Formats a money total consistently using currency.js (no raw arithmetic).
 * Both variants produce the same output; the prop is kept for future divergence.
 */
export function InvoiceTotal({ value, variant = 'admin' }: InvoiceTotalProps) {
  const formatted = currency(value).format()

  if (variant === 'portal') {
    return <span className="font-semibold">{formatted}</span>
  }

  return <span>{formatted}</span>
}
