import FinanceAccountStatementsPage from '@/components/finance/statements/FinanceAccountStatementsPage'

import { mountAccountChrome, mountElement, readRequiredIntDataset } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountAccountChrome()
  mountElement('FinanceAccountStatementsPage', (element) => (
    <FinanceAccountStatementsPage id={readRequiredIntDataset(element, 'accountId')} />
  ))
})
