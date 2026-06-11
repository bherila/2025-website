import FinanceImportCenterPage from '@/components/finance/FinanceImportCenterPage'

import { mountElement, mountFinanceNavbar } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountFinanceNavbar()
  mountElement('FinanceImportCenterPage', () => <FinanceImportCenterPage />)
})
