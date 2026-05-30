import currency from 'currency.js'

interface InvoiceTotalProps {
  value: number | string
  /** 'admin' renders plain text ($1,234.00). 'portal' renders bold text ($1,234.00). */
  variant?: 'admin' | 'portal'
}

/**
 * Formats a money total consistently using currency.js (no raw arithmetic).
 * The portal variant wraps the amount in a bold span; the admin variant renders plain text.
 */
export function InvoiceTotal({ value, variant = 'admin' }: InvoiceTotalProps) {
  const formatted = currency(value).format()

  if (variant === 'portal') {
    return <span className="font-semibold">{formatted}</span>
  }

  return <span>{formatted}</span>
}
