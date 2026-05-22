import { UtilityAccountListPage } from '@/components/utility-bill-tracker/UtilityAccountListPage'
import { mountElement } from '@/lib/mount'

document.addEventListener('DOMContentLoaded', () => {
  mountElement('UtilityAccountListPage', () => <UtilityAccountListPage />)
})
