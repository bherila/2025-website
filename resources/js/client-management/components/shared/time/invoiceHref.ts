/**
 * Returns the canonical client-portal invoice URL (singular /invoice/).
 */
export function clientInvoiceHref(slug: string, invoiceId: number): string {
  return `/client/portal/${slug}/invoice/${invoiceId}`
}
