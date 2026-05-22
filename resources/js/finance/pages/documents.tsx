import FinanceDocumentsPage from '@/components/finance/FinanceDocumentsPage'

import { mountElement, mountFinanceNavbar } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountFinanceNavbar()
  mountElement('FinanceDocumentsPage', () => <FinanceDocumentsPage />)
})
