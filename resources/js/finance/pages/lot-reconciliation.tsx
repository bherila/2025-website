import LotReconciliationPage from '@/components/finance/LotReconciliationPage'

import { mountElement, mountFinanceNavbar, readRequiredIntDataset } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountFinanceNavbar()
  mountElement('LotReconciliationPage', (element) => (
    <LotReconciliationPage taxDocumentId={readRequiredIntDataset(element, 'taxDocumentId')} />
  ))
})
