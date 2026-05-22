import TransactionsPage from '@/components/finance/TransactionsPage'

import {
  mountElement,
  mountFinanceNavbar,
  readAccountIdDataset,
  readJsonDataset,
} from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountFinanceNavbar()
  mountElement('TransactionsPage', (element) => (
    <TransactionsPage
      accountId={readAccountIdDataset(element)}
      initialAvailableYears={readJsonDataset<number[]>(element, 'availableYears', [])}
    />
  ))
})
