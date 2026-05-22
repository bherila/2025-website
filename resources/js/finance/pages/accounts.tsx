import FinanceAccountsPage from '@/components/finance/FinanceAccountsPage'

import { mountElement, mountFinanceNavbar } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountFinanceNavbar()
  mountElement('FinanceAccountsPage', () => <FinanceAccountsPage />)
})
