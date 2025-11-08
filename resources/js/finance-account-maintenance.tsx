import { createRoot } from 'react-dom/client'
import FinanceAccountMaintenancePage from './components/FinanceAccountMaintenancePage'

document.addEventListener('DOMContentLoaded', () => {
  const maintenanceDiv = document.getElementById('FinanceAccountMaintenancePage')
  if (maintenanceDiv) {
    const root = createRoot(maintenanceDiv)
    root.render(<FinanceAccountMaintenancePage
      accountId={parseInt(maintenanceDiv.dataset.accountId!)}
      accountName={maintenanceDiv.dataset.accountName!}
      whenClosed={maintenanceDiv.dataset.whenClosed || null}
      isDebt={maintenanceDiv.dataset.isDebt === '1'}
      isRetirement={maintenanceDiv.dataset.isRetirement === '1'}
    />)
  }
})