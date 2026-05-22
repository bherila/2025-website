import AllAccountsLotsPage from '@/components/finance/AllAccountsLotsPage'

import { mountElement, mountFinanceNavbar, readJsonDataset } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountFinanceNavbar()
  mountElement('AllAccountsLotsPage', (element) => (
    <AllAccountsLotsPage initialAvailableYears={readJsonDataset<number[]>(element, 'availableYears', [])} />
  ))
})
