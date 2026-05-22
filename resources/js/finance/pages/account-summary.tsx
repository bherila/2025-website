import SummaryClient from '@/components/finance/SummaryClient'

import { mountAccountChrome, mountElement, readRequiredIntDataset } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountAccountChrome()
  mountElement('AccountSummaryClient', (element) => (
    <SummaryClient id={readRequiredIntDataset(element, 'accountId')} />
  ))
})
