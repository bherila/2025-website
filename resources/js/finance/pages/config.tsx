import FinanceConfigPage from '@/components/finance/FinanceConfigPage'

import { mountElement, mountFinanceNavbar } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountFinanceNavbar()
  mountElement('FinanceConfigPage', () => <FinanceConfigPage />)
})
