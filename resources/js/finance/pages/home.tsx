import FinanceHomePage from '@/components/finance/FinanceHomePage'

import { mountElement, mountFinanceNavbar } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountFinanceNavbar()
  mountElement('FinanceHomePage', () => <FinanceHomePage />)
})
