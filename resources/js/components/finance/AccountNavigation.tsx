'use client'
import {Settings, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo,useState } from 'react'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  accountsUrl,
  getEffectiveYear,
  getTabUrl,
  importUrl,
  maintenanceUrl,
  type YearSelection
} from '@/lib/financeRouteBuilder'
import { cn } from '@/lib/utils'

import AccountYearSelector from './AccountYearSelector'

interface FinAccount {
  acct_id: number
  acct_name: string
}

/**
 * Fetches all finance accounts (asset, liability, retirement) and returns them as a flat list.
 */
export function useFinanceAccounts(): { accounts: FinAccount[]; isLoading: boolean } {
  const [accounts, setAccounts] = useState<FinAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)

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
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  return { accounts, isLoading }
}

// Tabs that show year selector
const TAB_ITEMS = [
  { value: 'transactions', title: 'Transactions', showYearSelector: true },
  { value: 'duplicates', title: 'Duplicates', showYearSelector: true },
  { value: 'linker', title: 'Linker', showYearSelector: true },
  { value: 'statements', title: 'Statements', showYearSelector: true },
  { value: 'lots', title: 'Lots', showYearSelector: false },
  { value: 'summary', title: 'Summary', showYearSelector: true },
]

// Button actions (no year selector needed in URL)
const ACTION_ITEMS = [
  { value: 'import', title: 'Import', icon: Upload },
  { value: 'maintenance', title: 'Maintenance', icon: Settings },
]

const ALL_NAV_ITEMS = [...TAB_ITEMS, ...ACTION_ITEMS]

export default function AccountNavigation({
  accountId,
  accountName,
  activeTab = 'transactions',
  onYearChange,
}: {
  accountId: number
  accountName: string
  activeTab?: string
  onYearChange?: (year: YearSelection) => void
}) {
  const [selectedYear, setSelectedYear] = useState<YearSelection>(() => getEffectiveYear(accountId))
  const { accounts, isLoading: loadingAccounts } = useFinanceAccounts()
  const [searchValue, setSearchValue] = useState('')

  // Update selected year when it changes via URL or selector
  useEffect(() => {
    const handleYearChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ accountId: number; year: YearSelection }>
      if (customEvent.detail.accountId === accountId) {
        setSelectedYear(customEvent.detail.year)
      }
    }
    window.addEventListener('financeYearChange', handleYearChange)
    return () => window.removeEventListener('financeYearChange', handleYearChange)
  }, [accountId])

  const activeTabTitle = ALL_NAV_ITEMS.find((item) => item.value === activeTab)?.title || ''
  const activeTabItem = TAB_ITEMS.find((item) => item.value === activeTab)
  const showYearSelector = activeTabItem?.showYearSelector ?? false

  const currentAccount = useMemo(() => {
    return accounts.find(a => a.acct_id === accountId) || { acct_id: accountId, acct_name: accountName }
  }, [accounts, accountId, accountName])

  const filteredAccounts = useMemo(() => {
    if (!searchValue) return accounts
    return accounts.filter(account =>
      account.acct_name.toLowerCase().includes(searchValue.toLowerCase())
    )
  }, [accounts, searchValue])

  const onAccountSelect = (account: FinAccount) => {
    if (account.acct_id === accountId) return
    window.location.href = getTabUrl(activeTab, account.acct_id, selectedYear)
  }

  return (
    <div className="mt-4 px-8">
      <div className="py-4 px-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href={accountsUrl()}>Accounts</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <Combobox
                onValueChange={(val) => {
                   if (val) onAccountSelect(val as FinAccount)
                }}
              >
                <ComboboxInput
                  placeholder={currentAccount.acct_name}
                  className="h-8 min-w-[200px]"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                />
                <ComboboxContent align="start" className="w-64">
                  <ComboboxEmpty>No accounts found</ComboboxEmpty>
                  <ComboboxList>
                    {loadingAccounts ? (
                      <div className="p-2 text-sm text-muted-foreground">Loading accounts...</div>
                    ) : (
                      filteredAccounts.map((account) => (
                        <ComboboxItem
                          key={account.acct_id}
                          value={account}
                          className={cn(
                            account.acct_id === accountId && 'bg-accent font-medium'
                          )}
                        >
                          {account.acct_name}
                        </ComboboxItem>
                      ))
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </BreadcrumbItem>
            {activeTabTitle && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{activeTabTitle}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <Tabs defaultValue={activeTab}>
            <TabsList>
              {TAB_ITEMS.map((item) => (
                <TabsTrigger key={item.value} value={item.value} asChild>
                  <a href={getTabUrl(item.value, accountId, selectedYear)}>{item.title}</a>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {showYearSelector && (
            <AccountYearSelector
              accountId={accountId}
              onYearChange={onYearChange}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          {ACTION_ITEMS.map((item) => (
            <Button
              key={item.value}
              variant={activeTab === item.value ? 'default' : 'outline'}
              size="sm"
              asChild
            >
              <a href={item.value === 'import' ? importUrl(accountId) : maintenanceUrl(accountId)} className="flex items-center gap-1">
                <item.icon className="h-4 w-4" />
                {item.title}
              </a>
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}