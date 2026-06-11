import FinanceCategorizationPage from '@/components/finance/FinanceCategorizationPage'

import { mountElement, mountFinanceNavbar } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountFinanceNavbar()
  mountElement('FinanceCategorizationPage', () => <FinanceCategorizationPage />)
})
