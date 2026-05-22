import LinkerPage from '@/components/finance/LinkerPage'

import { mountAccountChrome, mountElement, readRequiredIntDataset } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountAccountChrome()
  mountElement('LinkerPage', (element) => (
    <LinkerPage id={readRequiredIntDataset(element, 'accountId')} />
  ))
})
