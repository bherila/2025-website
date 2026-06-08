import PartnershipBasisTab from '@/components/finance/PartnershipBasisTab'

import { mountAccountChrome, mountElement, readRequiredIntDataset } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountAccountChrome()
  mountElement('PartnershipBasisTab', (element) => (
    <PartnershipBasisTab accountId={readRequiredIntDataset(element, 'accountId')} />
  ))
})
