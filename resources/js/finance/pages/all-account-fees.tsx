import AllAccountsFeesTab from '@/components/finance/AllAccountsFeesTab'

import { mountElement, mountFinanceNavbar } from '../bootstrap'

document.addEventListener('DOMContentLoaded', () => {
  mountFinanceNavbar()
  mountElement('AllAccountsFeesTab', () => <AllAccountsFeesTab />)
})
