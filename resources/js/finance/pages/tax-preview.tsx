import TaxPreviewPage, { type TaxPreviewPreload } from '@/components/finance/TaxPreviewPage'

import { mountElement, mountFinanceNavbar } from '../bootstrap'

function readTaxPreviewPreload(): TaxPreviewPreload | null {
  const element = document.getElementById('tax-preview-data')

  if (!element?.textContent) {
    return null
  }

  try {
    return JSON.parse(element.textContent) as TaxPreviewPreload
  } catch {
    return null
  }
}

document.addEventListener('DOMContentLoaded', () => {
  mountFinanceNavbar()

  mountElement('TaxPreviewPage', () => (
    <TaxPreviewPage initialData={readTaxPreviewPreload()} />
  ))

  mountElement('ScheduleCPage', () => (
    <TaxPreviewPage initialData={readTaxPreviewPreload()} />
  ))
})
