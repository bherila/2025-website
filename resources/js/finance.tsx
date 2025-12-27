import { createRoot } from 'react-dom/client'
import AccountNavigation from '@/components/finance/AccountNavigation'
import SummaryClient from '@/components/finance/SummaryClient'
import FinanceAccountsPage from '@/components/finance/FinanceAccountsPage'
import FinanceAccountTransactionsPage from '@/components/finance/FinanceAccountTransactionsPage'
import FinanceAccountStatementsPage from '@/components/finance/statements/FinanceAccountStatementsPage'
import ImportTransactionsClient from '@/components/finance/ImportTransactionsClient'
import DuplicatesPage from '@/components/finance/DuplicatesPage'
import LinkerPage from '@/components/finance/LinkerPage'
import ManageTagsPage from '@/components/finance/ManageTagsPage'

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

  const manageTagsDiv = document.getElementById('ManageTagsPage')
  if (manageTagsDiv) {
    const root = createRoot(manageTagsDiv)
    root.render(<ManageTagsPage />)
  }
})
