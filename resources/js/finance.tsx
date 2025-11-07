import { createRoot } from 'react-dom/client'
import AccountNavigation from './components/AccountNavigation'
import SummaryClient from './components/SummaryClient'
import FinanceAccountsPage from './components/FinanceAccountsPage'

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
})