import AllInvoicesPage from '@/client-management/components/admin/AllInvoicesPage'
import { mountElement } from '@/lib/mount'

document.addEventListener('DOMContentLoaded', () => {
  mountElement('AllInvoicesPage', () => <AllInvoicesPage />)
})
