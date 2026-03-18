import { createRoot } from 'react-dom/client'

import AccountNavigation from '@/components/finance/AccountNavigation'
import AllAccountsLotsPage from '@/components/finance/AllAccountsLotsPage'
import DuplicatesPage from '@/components/finance/DuplicatesPage'
import FinanceAccountLotsPage from '@/components/finance/FinanceAccountLotsPage'
import FinanceAccountsPage from '@/components/finance/FinanceAccountsPage'
import FinanceNavbar, { type FinanceSection } from '@/components/finance/FinanceNavbar'
import ImportTransactionsClient from '@/components/finance/ImportTransactionsClient'
import LinkerPage from '@/components/finance/LinkerPage'
import ManageTagsPage from '@/components/finance/ManageTagsPage'
import ScheduleCPage from '@/components/finance/ScheduleCPage'
import FinanceAccountStatementsPage from '@/components/finance/statements/FinanceAccountStatementsPage'
import SummaryClient from '@/components/finance/SummaryClient'
import TransactionsPage from '@/components/finance/TransactionsPage'
import RulesList from '@/components/finance/rules_engine/RulesList'

document.addEventListener('DOMContentLoaded', () => {
  // Standalone FinanceNavbar
  const financeNavbarDiv = document.getElementById('FinanceNavbar')
  if (financeNavbarDiv) {
    const root = createRoot(financeNavbarDiv)
    const rawAccountId = financeNavbarDiv.dataset.accountId
    const accountId: number | 'all' | undefined =
      rawAccountId === 'all' ? 'all' : rawAccountId ? parseInt(rawAccountId) : undefined
    const activeTab = financeNavbarDiv.dataset.activeTab
    const activeSection = financeNavbarDiv.dataset.activeSection as FinanceSection | undefined
    const navbarProps: {
      accountId?: number | 'all'
      activeTab?: string
      activeSection?: FinanceSection
    } = {}
    if (accountId !== undefined) navbarProps.accountId = accountId
    if (activeTab) navbarProps.activeTab = activeTab
    if (activeSection) navbarProps.activeSection = activeSection
    root.render(<FinanceNavbar {...navbarProps} />)
  }

  // Simplified AccountNavigation (year selector + import + maintenance)
  const navDiv = document.getElementById('AccountNavigation')
  if (navDiv) {
    const root = createRoot(navDiv)
    const rawAccountId = navDiv.dataset.accountId
    const accountId: number | 'all' = rawAccountId === 'all' ? 'all' : parseInt(rawAccountId!)
    const activeTab = navDiv.dataset.activeTab
    const navProps: {
      accountId: number | 'all'
      activeTab?: string
    } = { accountId }
    if (activeTab) navProps.activeTab = activeTab
    root.render(<AccountNavigation {...navProps} />)
  }

  // Unified TransactionsPage (replaces AllTransactionsPage + FinanceAccountTransactionsPage)
  const transactionsPageDiv = document.getElementById('TransactionsPage')
  if (transactionsPageDiv) {
    const root = createRoot(transactionsPageDiv)
    const rawAccountId = transactionsPageDiv.dataset.accountId
    const accountId: number | 'all' = rawAccountId === 'all' ? 'all' : parseInt(rawAccountId!)
    const initialAvailableYears = JSON.parse(transactionsPageDiv.dataset.availableYears || '[]')
    root.render(
      <TransactionsPage
        accountId={accountId}
        initialAvailableYears={initialAvailableYears}
      />,
    )
  }

  // All accounts lots analysis
  const allLotsDiv = document.getElementById('AllAccountsLotsPage')
  if (allLotsDiv) {
    const root = createRoot(allLotsDiv)
    const initialAvailableYears = JSON.parse(allLotsDiv.dataset.availableYears || '[]')
    root.render(<AllAccountsLotsPage initialAvailableYears={initialAvailableYears} />)
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

  const balanceHistoryDiv = document.getElementById('FinanceAccountStatementsPage')
  if (balanceHistoryDiv) {
    const root = createRoot(balanceHistoryDiv)
    root.render(<FinanceAccountStatementsPage id={parseInt(balanceHistoryDiv.dataset.accountId!)} />)
  }

  const importTransactionsDiv = document.getElementById('ImportTransactionsClient')
  if (importTransactionsDiv) {
    const root = createRoot(importTransactionsDiv)
    const rawAccountId = importTransactionsDiv.dataset.accountId
    const accountId: number | 'all' = rawAccountId === 'all' ? 'all' : parseInt(rawAccountId!)
    root.render(
      <ImportTransactionsClient
        id={accountId}
        accountName={importTransactionsDiv.dataset.accountName!}
      />,
    )
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

  const configPageDiv = document.getElementById('FinanceConfigPage')
  if (configPageDiv) {
    const root = createRoot(configPageDiv)
    root.render(<RulesList />)
  }
})
