import ManageTagsPage from '@/components/finance/ManageTagsPage'

import { mountElement, mountFinanceNavbar } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountFinanceNavbar()
  mountElement('ManageTagsPage', () => <ManageTagsPage />)
})
