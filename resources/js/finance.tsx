import { createRoot } from 'react-dom/client'
import AccountNavigation from './components/AccountNavigation'
import SummaryClient from './components/SummaryClient'
import FinanceAccountsPage from './components/FinanceAccountsPage'
import FinanceAccountIndexPage from './components/FinanceAccountIndexPage'
import FinanceAccountBalanceHistoryPage from './components/FinanceAccountBalanceHistoryPage'
import FinanceAccountMaintenancePage from './components/FinanceAccountMaintenancePage'

document.addEventListener('DOMContentLoaded', () => {
  const navDiv = document.getElementById('AccountNavigation')
  if (navDiv) {
    const root = createRoot(navDiv)
    root.render(<AccountNavigation
      accountId={parseInt(navDiv.dataset.accountId!)}
      activeTab={navDiv.dataset.activeTab!}
      accountName={navDiv.dataset.accountName!}
    />)
  }

  const summaryDiv = document.getElementById('AccountSummaryClient')
  if (summaryDiv) {
    const root = createRoot(summaryDiv)
    const totals = JSON.parse(summaryDiv.dataset.totals!)
    const symbolSummary = JSON.parse(summaryDiv.dataset.symbolSummary!)
    const monthSummary = JSON.parse(summaryDiv.dataset.monthSummary!)
    root.render(<SummaryClient
      totals={totals}
      symbolSummary={symbolSummary}
      monthSummary={monthSummary}
    />)
  }

  const accountsDiv = document.getElementById('FinanceAccountsPage')
  if (accountsDiv) {
    const root = createRoot(accountsDiv)
    root.render(<FinanceAccountsPage />)
  }

  const accountIndexDiv = document.getElementById('FinanceAccountIndexPage')
  if (accountIndexDiv) {
    const root = createRoot(accountIndexDiv)
    root.render(<FinanceAccountIndexPage id={parseInt(accountIndexDiv.dataset.accountId!)} />)
  }

  const balanceHistoryDiv = document.getElementById('FinanceAccountBalanceHistoryPage')
  if (balanceHistoryDiv) {
    const root = createRoot(balanceHistoryDiv)
    root.render(<FinanceAccountBalanceHistoryPage id={parseInt(balanceHistoryDiv.dataset.accountId!)} />)
  }

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
