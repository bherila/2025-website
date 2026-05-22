import FinanceAccountMaintenancePage from '@/components/finance/FinanceAccountMaintenancePage'

import { mountAccountChrome, mountElement, readRequiredIntDataset } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountAccountChrome()
  mountElement('FinanceAccountMaintenancePage', (element) => (
    <FinanceAccountMaintenancePage
      accountId={readRequiredIntDataset(element, 'accountId')}
      accountName={element.dataset.accountName!}
      whenClosed={element.dataset.whenClosed || null}
      isDebt={element.dataset.isDebt === '1'}
      isRetirement={element.dataset.isRetirement === '1'}
      acctNumber={element.dataset.acctNumber || null}
    />
  ))
})
