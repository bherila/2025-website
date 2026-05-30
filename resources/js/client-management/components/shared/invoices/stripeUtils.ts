export interface StripePaymentInfo {
  stripe_failure_reason?: string | null
  stripe_payment_status?: string | null
}

export function hasStripePaymentFailure(invoice: StripePaymentInfo): boolean {
  return Boolean(invoice.stripe_failure_reason || ['failed', 'canceled'].includes(invoice.stripe_payment_status ?? ''))
}
