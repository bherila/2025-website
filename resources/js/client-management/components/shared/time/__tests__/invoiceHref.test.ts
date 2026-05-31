import { clientInvoiceHref } from '../invoiceHref'

describe('clientInvoiceHref', () => {
  it('produces the singular /invoice/ path (not /invoices/)', () => {
    const result = clientInvoiceHref('acme', 42)
    expect(result).toBe('/client/portal/acme/invoice/42')
    expect(result).not.toContain('/invoices/')
  })

  it('interpolates slug and invoiceId correctly', () => {
    expect(clientInvoiceHref('big-corp', 999)).toBe('/client/portal/big-corp/invoice/999')
  })

  it('handles slug with hyphens', () => {
    expect(clientInvoiceHref('my-client-slug', 1)).toBe('/client/portal/my-client-slug/invoice/1')
  })
})
