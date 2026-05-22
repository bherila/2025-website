import ImportTransactionsClient from '@/components/finance/import_transactions/ImportTransactionsClient'

import { mountAccountChrome, mountElement, readAccountIdDataset } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountAccountChrome()
  mountElement('ImportTransactionsClient', (element) => (
    <ImportTransactionsClient
      id={readAccountIdDataset(element)}
      accountName={element.dataset.accountName!}
    />
  ))
})
