import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { MillerCommandPalette, type MillerCommandPaletteRow } from '@/components/ui/miller'
import { commandFilter } from '@/lib/commandSearch'
import { FINANCE_ACCOUNT_TOOLS, FINANCE_TOP_TOOLS, type FinanceAccountToolDef } from '@/lib/financeNavigation'
import { financeAccountToolUrl, getEffectiveYear, getYearFromUrl, YEAR_CHANGED_EVENT, type YearSelection } from '@/lib/financeRouteBuilder'
import { hasPermission } from '@/lib/permissions'

import {
  type FinanceCommandCategory,
  type FinanceCommandRow,
  setFinanceCommandPaletteOpen,
  toggleFinanceCommandPalette,
  useFinanceCommandPaletteOpen,
  useFinanceCommandRows,
} from './FinanceCommandRegistry'
import { type FinAccount, useFinanceAccounts } from './useFinanceAccounts'

const GROUP_HEADINGS: Record<FinanceCommandCategory, string> = {
  'Current account': 'Current account',
  Accounts: 'Accounts',
  'All accounts': 'All accounts',
  'Finance tools': 'Finance tools',
  'Tax Preview': 'Tax Preview',
}

interface FinanceCommandPaletteProps {
  currentAccountId?: number | 'all' | undefined
  activeTab?: string | undefined
  activeSection?: string | undefined
  accounts?: FinAccount[] | undefined
  onNavigate?: ((href: string) => void) | undefined
}

interface PaletteRow extends MillerCommandPaletteRow<FinanceCommandCategory> {
  rowKey: string
  sourceRow: FinanceCommandRow
  description?: string
  priority: number
}

export function FinanceCommandPalette({
  currentAccountId,
  activeTab,
  activeSection,
  accounts: providedAccounts,
  onNavigate = navigateToFinanceCommandHref,
}: FinanceCommandPaletteProps): React.ReactElement {
  const [open, setOpen] = useFinanceCommandPaletteOpen()
  const [hasOpened, setHasOpened] = useState(open)
  const [currentYear, setCurrentYear] = useState<YearSelection | null>(() => readPaletteYear(currentAccountId, activeTab))
  const { accounts: fetchedAccounts } = useFinanceAccounts({ enabled: hasOpened && providedAccounts === undefined && hasPermission('finance.accounts.basic') })
  const accounts = providedAccounts ?? fetchedAccounts
  const registeredRows = useFinanceCommandRows()

  useEffect(() => {
    if (open) {
      setHasOpened(true)
    }
  }, [open])

  useFinanceCommandPaletteShortcut(open)

  useEffect(() => {
    const syncYear = (): void => setCurrentYear(readPaletteYear(currentAccountId, activeTab))

    window.addEventListener(YEAR_CHANGED_EVENT, syncYear)
    window.addEventListener('popstate', syncYear)
    return () => {
      window.removeEventListener(YEAR_CHANGED_EVENT, syncYear)
      window.removeEventListener('popstate', syncYear)
    }
  }, [activeTab, currentAccountId])

  const paletteYear = open ? readPaletteYear(currentAccountId, activeTab) : currentYear
  const builtRows = useMemo(
    () => buildFinanceCommandRows(accounts, currentAccountId, paletteYear),
    [accounts, currentAccountId, paletteYear],
  )
  const rows = useMemo(
    () => [...builtRows, ...registeredRows].map(toPaletteRow).sort(sortRows),
    [builtRows, registeredRows],
  )
  const groupOrder = useMemo(
    () => financeCommandGroupOrder(currentAccountId, activeSection),
    [activeSection, currentAccountId],
  )

  const handleSelect = (row: PaletteRow): void => {
    if (row.sourceRow.disabled) {
      return
    }
    if (row.sourceRow.action) {
      row.sourceRow.action()
      return
    }
    if (row.sourceRow.href) {
      onNavigate(row.sourceRow.href)
    }
  }

  return (
    <MillerCommandPalette
      open={open}
      onOpenChange={setOpen}
      title="Finance command palette"
      description="Jump to accounts, finance tools, forms, schedules, and worksheets."
      placeholder={activeSection === 'tax-preview' ? 'Jump to an account, tool, form, schedule, or worksheet…' : 'Jump to an account, tool, or page…'}
      emptyMessage="No matching finance commands."
      groupOrder={groupOrder}
      groupHeadings={GROUP_HEADINGS}
      rows={rows}
      onSelect={handleSelect}
      filter={commandFilter}
    />
  )
}

function navigateToFinanceCommandHref(href: string): void {
  window.location.href = href
}

export function FinanceCommandPaletteTrigger(): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => setFinanceCommandPaletteOpen(true)}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Open finance command palette"
    >
      <Search className="h-3.5 w-3.5" aria-hidden="true" />
      <span>Search…</span>
      <kbd className="hidden rounded border border-border bg-muted px-1 font-mono text-[10px] sm:inline">{navigatorMeta()}K</kbd>
    </button>
  )
}

function buildFinanceCommandRows(
  accounts: FinAccount[],
  currentAccountId: number | 'all' | undefined,
  currentYear: YearSelection | null,
): FinanceCommandRow[] {
  const rows: FinanceCommandRow[] = FINANCE_TOP_TOOLS.filter((tool) => !tool.permission || hasPermission(tool.permission)).map((tool) => ({
    id: `tool:${tool.id}`,
    label: tool.label,
    description: 'Finance tool',
    category: 'Finance tools',
    href: tool.href,
    keywords: [tool.id, tool.label, ...tool.keywords],
  }))

  for (const tool of FINANCE_ACCOUNT_TOOLS.filter((tool) => hasPermission(tool.permission))) {
    const options = routeOptionsForTool(tool, currentYear)
    if (tool.supportsAllAccounts) {
      rows.push({
        id: `account:all:${tool.id}`,
        label: `All Accounts → ${tool.label}`,
        description: 'All accounts',
        category: 'All accounts',
        href: financeAccountToolUrl(tool.id, 'all', options),
        keywords: ['all accounts', 'all', tool.label, ...keywordsForAccountTool(tool)],
      })
    }

    for (const account of accounts) {
      rows.push({
        id: `account:${account.acct_id}:${tool.id}`,
        label: `${account.acct_name} → ${tool.label}`,
        description: `Account #${account.acct_id}`,
        category: account.acct_id === currentAccountId ? 'Current account' : 'Accounts',
        href: financeAccountToolUrl(tool.id, account.acct_id, options),
        keywords: [
          account.acct_name,
          String(account.acct_id),
          account.acct_number ?? '',
          last4(account.acct_number),
          tool.label,
          ...keywordsForAccountTool(tool),
        ],
        priority: account.acct_id === currentAccountId ? 100 : 0,
      })
    }
  }

  return rows
}

function readPaletteYear(currentAccountId?: number | 'all', activeTab?: string): YearSelection | null {
  if (typeof window === 'undefined') {
    return null
  }

  const urlYear = getYearFromUrl()
  if (urlYear !== null) {
    return urlYear
  }

  if (typeof currentAccountId === 'number' && activeTab !== 'transactions') {
    return getEffectiveYear(currentAccountId)
  }

  return null
}

function routeOptionsForTool(tool: FinanceAccountToolDef, currentYear: YearSelection | null): { year?: YearSelection } {
  if (!tool.preserveYear || currentYear === null) {
    return {}
  }

  return { year: currentYear }
}

function keywordsForAccountTool(tool: FinanceAccountToolDef): string[] {
  if (tool.id !== 'transactions') {
    return tool.keywords
  }

  return [...tool.keywords, 'transaction', 'transactions', 'tx', 'txns', 'activity', 'line items']
}

function last4(value?: string | null): string {
  if (!value) {
    return ''
  }

  return value.replace(/\D/g, '').slice(-4)
}

function toPaletteRow(row: FinanceCommandRow): PaletteRow {
  return {
    rowKey: row.id,
    label: row.label,
    ...(row.description ?? row.disabledReason ? { description: row.description ?? row.disabledReason } : {}),
    keywords: [row.label, row.description ?? '', row.disabledReason ?? '', ...row.keywords],
    category: row.category,
    priority: row.priority ?? 0,
    sourceRow: row,
  }
}

function sortRows(a: PaletteRow, b: PaletteRow): number {
  return b.priority - a.priority || a.label.localeCompare(b.label)
}

function financeCommandGroupOrder(
  currentAccountId: number | 'all' | undefined,
  activeSection?: string,
): FinanceCommandCategory[] {
  if (currentAccountId !== undefined) {
    return ['Current account', 'Accounts', 'All accounts', 'Finance tools', 'Tax Preview']
  }

  if (activeSection === 'tax-preview' || (typeof window !== 'undefined' && window.location.pathname.includes('/finance/tax-preview'))) {
    return ['Tax Preview', 'Finance tools', 'All accounts', 'Accounts']
  }

  return ['Finance tools', 'All accounts', 'Accounts', 'Tax Preview']
}

function useFinanceCommandPaletteShortcut(open: boolean): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (!isPaletteShortcut(event) || event.defaultPrevented) {
        return
      }
      if (!open && shouldSuppressPaletteShortcut(event)) {
        return
      }

      event.preventDefault()
      toggleFinanceCommandPalette()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])
}

function isPaletteShortcut(event: KeyboardEvent): boolean {
  return (event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)
}

function shouldSuppressPaletteShortcut(event: KeyboardEvent): boolean {
  return isEditableTarget(event) || document.querySelector('[role="dialog"][data-open]') !== null
}

function isEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target instanceof HTMLElement ? event.target : document.activeElement
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
    return true
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function navigatorMeta(): string {
  if (typeof navigator === 'undefined') {
    return '⌘'
  }
  return /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘' : 'Ctrl '
}
