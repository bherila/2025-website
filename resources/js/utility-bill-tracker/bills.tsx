import { UtilityBillListPage } from '@/components/utility-bill-tracker/UtilityBillListPage'
import { mountElement, readRequiredDataset, readRequiredIntDataset } from '@/lib/mount'

document.addEventListener('DOMContentLoaded', () => {
  mountElement('UtilityBillListPage', (element) => (
    <UtilityBillListPage
      accountId={readRequiredIntDataset(element, 'accountId')}
      accountName={readRequiredDataset(element, 'accountName')}
      accountType={readRequiredDataset(element, 'accountType') as 'Electricity' | 'General'}
    />
  ))
})
