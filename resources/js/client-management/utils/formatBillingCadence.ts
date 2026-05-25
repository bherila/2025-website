import type { BillingCadence } from '@/client-management/types/client-agreement'

export function formatBillingCadence(cadence: BillingCadence): string {
  switch (cadence) {
    case 'monthly':
      return 'Monthly'
    case 'quarterly':
      return 'Quarterly'
    case 'semi_annual':
      return 'Semiannual'
    case 'annual':
      return 'Annual'
  }
}
