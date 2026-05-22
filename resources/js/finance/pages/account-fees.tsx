import FeesTab from '@/components/finance/FeesTab'

import { mountAccountChrome, mountElement, readRequiredIntDataset } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountAccountChrome()
  mountElement('FeesTab', (element) => (
    <FeesTab accountId={readRequiredIntDataset(element, 'accountId')} />
  ))
})
