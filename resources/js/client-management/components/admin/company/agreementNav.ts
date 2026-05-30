import type { Agreement } from '@/client-management/types/common'

/** Navigates the browser to the admin agreement editor. */
export function openAgreement(agreement: Agreement): void {
  window.location.href = `/client/mgmt/agreement/${agreement.id}`
}
