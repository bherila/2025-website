import FinanceAccountLotsPage from '@/components/finance/FinanceAccountLotsPage'

import { mountAccountChrome, mountElement, readRequiredIntDataset } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountAccountChrome()
  mountElement('FinanceAccountLotsPage', (element) => (
    <FinanceAccountLotsPage id={readRequiredIntDataset(element, 'accountId')} />
  ))
})
