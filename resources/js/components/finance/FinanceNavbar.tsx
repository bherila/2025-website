'use client'

import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { accountTabUrl, allAccountsUrl, type YearSelection } from '@/lib/financeRouteBuilder'
import { cn } from '@/lib/utils'

interface FinAccount {
  acct_id: number
  acct_name: string
}

const ALL_ACCOUNTS_SENTINEL: FinAccount = { acct_id: 0, acct_name: 'All Accounts' }

export type FinanceSection =
  | 'accounts'
  | 'rsu'
  | 'payslips'
  | 'all-transactions'
  | 'schedule-c'
  | 'tags'

/** Right-side nav items */
const RIGHT_SECTIONS: { value: FinanceSection; label: string; href: string }[] = [
  { value: 'schedule-c', label: 'Schedule C', href: '/finance/schedule-c' },
  { value: 'rsu', label: 'RSU', href: '/finance/rsu' },
  { value: 'payslips', label: 'Payslips', href: '/finance/payslips' },
  { value: 'tags', label: 'Tags', href: '/finance/tags' },
  { value: 'accounts', label: 'Accounts', href: '/finance/accounts' },
]

/** Exported for backwards compat with tests */
export const FINANCE_SECTIONS = RIGHT_SECTIONS

/** Left-side account tabs */
const ACCOUNT_TABS: { value: string; label: string; disabledForAll: boolean }[] = [
  { value: 'transactions', label: 'Transactions', disabledForAll: false },
  { value: 'duplicates', label: 'Duplicates', disabledForAll: true },
  { value: 'linker', label: 'Linker', disabledForAll: true },
  { value: 'statements', label: 'Statements', disabledForAll: true },
  { value: 'lots', label: 'Lots', disabledForAll: false },
  { value: 'summary', label: 'Summary', disabledForAll: true },
]

export interface FinanceNavbarProps {
  /** Account ID: number for specific account, 'all' for all accounts, undefined for non-account pages */
  accountId?: number | 'all'
  /** Active account tab on the LEFT side */
  activeTab?: string
  /** Active right-side section */
  activeSection?: FinanceSection
  /** Additional content below nav bar */
  children?: React.ReactNode
}

export default function FinanceNavbar({
  accountId,
  activeTab,
  activeSection,
  children,
}: FinanceNavbarProps) {
  const [accounts, setAccounts] = useState<FinAccount[]>([])
  const [searchValue, setSearchValue] = useState('')
  const [isComboboxOpen, setIsComboboxOpen] = useState(false)

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/finance/accounts')
      if (response.ok) {
        const data = await response.json()
        const all: FinAccount[] = [
          ...(data.assetAccounts || []),
          ...(data.liabilityAccounts || []),
          ...(data.retirementAccounts || []),
        ]
        setAccounts(all)
      }
    } catch (error) {
      console.error('Failed to fetch finance accounts:', error)
    }
  }, [])

  useEffect(() => {
    if (accountId !== undefined) {
      fetchAccounts()
    }
  }, [accountId, fetchAccounts])

  const currentAccount = useMemo<FinAccount>(() => {
    if (accountId === 'all') return ALL_ACCOUNTS_SENTINEL
    if (accountId !== undefined) {
      return accounts.find((a) => a.acct_id === accountId) ?? { acct_id: accountId, acct_name: String(accountId) }
    }
    return ALL_ACCOUNTS_SENTINEL
  }, [accounts, accountId])

  const filteredAccounts = useMemo<FinAccount[]>(() => {
    const base = [ALL_ACCOUNTS_SENTINEL, ...accounts]
    if (!searchValue) return base
    const q = searchValue.toLowerCase()
    return base.filter((a) => a.acct_name.toLowerCase().includes(q))
  }, [accounts, searchValue])

  const handleAccountSelect = (account: FinAccount) => {
    const currentTab = activeTab || 'transactions'
    let tab = currentTab
    setSearchValue('')
    setIsComboboxOpen(false)
    if (account.acct_id === 0) {
      // Fall back to transactions if current tab is disabled for all-accounts
      const tabConfig = ACCOUNT_TABS.find(t => t.value === currentTab)
      if (tabConfig?.disabledForAll) tab = 'transactions'
      window.location.href = allAccountsUrl(tab)
    } else {
      const year: YearSelection | undefined = undefined
      window.location.href = accountTabUrl(tab, account.acct_id, year)
    }
  }

  const getAccountTabUrl = (tab: string) => {
    if (accountId === 'all') return allAccountsUrl(tab)
    if (accountId !== undefined) return accountTabUrl(tab, accountId as number)
    return '#'
  }

  return (
    <div>
      <div className="w-full border-b border-border/40 bg-background">
        <div className="flex items-center gap-2 px-4 h-12">
          {/* Back button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="icon" className="h-7 w-7 shrink-0" asChild>
                <a href="/" aria-label="Back to BWH">
                  <ArrowLeft className="h-4 w-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Back to BWH</TooltipContent>
          </Tooltip>

          {/* FINANCE branding */}
          <span
            className="text-xs font-bold tracking-widest uppercase text-foreground select-none"
            aria-label="Finance section"
          >
            Finance
          </span>

          {/* Account combobox (only when accountId is defined) */}
          {accountId !== undefined && (
            <Combobox
              onValueChange={(val) => {
                if (val) handleAccountSelect(val as FinAccount)
              }}
              open={isComboboxOpen}
              onOpenChange={setIsComboboxOpen}
            >
              <ComboboxInput
                placeholder="Search accounts…"
                aria-label={`Selected account: ${currentAccount.acct_name}`}
                className="h-8 min-w-[180px]"
                value={isComboboxOpen ? searchValue : currentAccount.acct_name}
                onChange={(e) => setSearchValue(e.target.value)}
                onFocus={() => {
                  setIsComboboxOpen(true)
                  setSearchValue('')
                }}
              />
              <ComboboxContent align="start" className="w-64">
                <ComboboxList>
                  {filteredAccounts.map((account) => (
                    <ComboboxItem
                      key={account.acct_id}
                      value={account}
                      className={cn(
                        account.acct_id === (accountId === 'all' ? 0 : accountId) && 'bg-accent font-medium',
                      )}
                    >
                      {account.acct_name}
                    </ComboboxItem>
                  ))}
                  {filteredAccounts.length === 0 && searchValue && (
                    <div className="py-2 text-center text-sm text-muted-foreground">No accounts found</div>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          )}

          {/* Transactions link (only when accountId is undefined, i.e. non-account pages) */}
          {accountId === undefined && (
            <a
              href="/finance/account/all/transactions"
              className={cn(
                navigationMenuTriggerStyle(),
                'h-8 px-3 text-sm text-muted-foreground',
              )}
            >
              Transactions
            </a>
          )}

          {/* Account tabs (only when accountId is defined) */}
          {accountId !== undefined && (
            <div className="flex items-center gap-1">
              {ACCOUNT_TABS.map((tab) => {
                const isDisabled = tab.disabledForAll && accountId === 'all'
                const isActive = activeTab === tab.value
                return (
                  <a
                    key={tab.value}
                    href={isDisabled ? undefined : getAccountTabUrl(tab.value)}
                    aria-current={isActive ? 'page' : undefined}
                    aria-disabled={isDisabled ? 'true' : undefined}
                    className={cn(
                      navigationMenuTriggerStyle(),
                      'h-8 px-3 text-sm',
                      isActive ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground',
                      isDisabled && 'opacity-40 pointer-events-none',
                    )}
                  >
                    {tab.label}
                  </a>
                )
              })}
            </div>
          )}

          {/* Right-side sections */}
          <NavigationMenu viewport={false} className="ml-auto">
            <NavigationMenuList>
              {RIGHT_SECTIONS.map((section) => (
                <NavigationMenuItem key={section.value}>
                  <NavigationMenuLink
                    href={section.href}
                    aria-current={section.value === activeSection ? 'page' : undefined}
                    className={cn(
                      navigationMenuTriggerStyle(),
                      'h-8 px-3 text-sm',
                      section.value === activeSection
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground',
                    )}
                  >
                    {section.label}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </div>

      {children}
    </div>
  )
}
