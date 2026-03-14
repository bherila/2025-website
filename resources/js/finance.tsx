import { createRoot } from 'react-dom/client'

import AccountNavigation from '@/components/finance/AccountNavigation'
import AllTransactionsPage from '@/components/finance/AllTransactionsPage'
import DuplicatesPage from '@/components/finance/DuplicatesPage'
import FinanceAccountLotsPage from '@/components/finance/FinanceAccountLotsPage'
import FinanceAccountsPage from '@/components/finance/FinanceAccountsPage'
import FinanceAccountTransactionsPage from '@/components/finance/FinanceAccountTransactionsPage'
import FinanceNavbar, { type FinanceSection } from '@/components/finance/FinanceNavbar'
import ImportTransactionsClient from '@/components/finance/ImportTransactionsClient'
import LinkerPage from '@/components/finance/LinkerPage'
import ManageTagsPage from '@/components/finance/ManageTagsPage'
import ScheduleCPage from '@/components/finance/ScheduleCPage'
import FinanceAccountStatementsPage from '@/components/finance/statements/FinanceAccountStatementsPage'
import SummaryClient from '@/components/finance/SummaryClient'

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
    root.render(<SummaryClient id={parseInt(summaryDiv.dataset.accountId!)} />)
  }

  const accountsDiv = document.getElementById('FinanceAccountsPage')
  if (accountsDiv) {
    const root = createRoot(accountsDiv)
    root.render(<FinanceAccountsPage />)
  }

  const accountIndexDiv = document.getElementById('FinanceAccountTransactionsPage')
  if (accountIndexDiv) {
    const root = createRoot(accountIndexDiv)
    root.render(<FinanceAccountTransactionsPage id={parseInt(accountIndexDiv.dataset.accountId!)} />)
  }

  const balanceHistoryDiv = document.getElementById('FinanceAccountStatementsPage')
  if (balanceHistoryDiv) {
    const root = createRoot(balanceHistoryDiv)
    root.render(<FinanceAccountStatementsPage id={parseInt(balanceHistoryDiv.dataset.accountId!)} />)
  }

  const importTransactionsDiv = document.getElementById('ImportTransactionsClient')
  if (importTransactionsDiv) {
    const root = createRoot(importTransactionsDiv)
    root.render(<ImportTransactionsClient
      id={parseInt(importTransactionsDiv.dataset.accountId!)}
      accountName={importTransactionsDiv.dataset.accountName!}
    />)
  }

  const duplicatesDiv = document.getElementById('DuplicatesPage')
  if (duplicatesDiv) {
    const root = createRoot(duplicatesDiv)
    root.render(<DuplicatesPage id={parseInt(duplicatesDiv.dataset.accountId!)} />)
  }

  const linkerDiv = document.getElementById('LinkerPage')
  if (linkerDiv) {
    const root = createRoot(linkerDiv)
    root.render(<LinkerPage id={parseInt(linkerDiv.dataset.accountId!)} />)
  }

  const lotsDiv = document.getElementById('FinanceAccountLotsPage')
  if (lotsDiv) {
    const root = createRoot(lotsDiv)
    root.render(<FinanceAccountLotsPage id={parseInt(lotsDiv.dataset.accountId!)} />)
  }

  const manageTagsDiv = document.getElementById('ManageTagsPage')
  if (manageTagsDiv) {
    const root = createRoot(manageTagsDiv)
    root.render(<ManageTagsPage />)
  }

  const scheduleCDiv = document.getElementById('ScheduleCPage')
  if (scheduleCDiv) {
    const root = createRoot(scheduleCDiv)
    root.render(<ScheduleCPage />)
  }

  // Standalone FinanceNavbar (for pages like Accounts that need only the nav bar)
  const financeNavbarDiv = document.getElementById('FinanceNavbar')
  if (financeNavbarDiv) {
    const root = createRoot(financeNavbarDiv)
    const activeSection = (financeNavbarDiv.dataset.activeSection || 'accounts') as FinanceSection
    root.render(<FinanceNavbar activeSection={activeSection} />)
  }

  // All Transactions page
  const allTransactionsDiv = document.getElementById('AllTransactionsPage')
  if (allTransactionsDiv) {
    const root = createRoot(allTransactionsDiv)
    const initialAvailableYears = JSON.parse(allTransactionsDiv.dataset.availableYears || '[]')
    root.render(<AllTransactionsPage initialAvailableYears={initialAvailableYears} />)
  }
})
