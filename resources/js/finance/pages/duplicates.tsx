import DuplicatesPage from '@/components/finance/DuplicatesPage'

import { mountAccountChrome, mountElement, readRequiredIntDataset } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountAccountChrome()
  mountElement('DuplicatesPage', (element) => (
    <DuplicatesPage id={readRequiredIntDataset(element, 'accountId')} />
  ))
})
