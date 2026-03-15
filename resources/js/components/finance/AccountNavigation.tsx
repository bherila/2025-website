'use client'
import { Settings, Upload } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  getEffectiveYear,
  importUrl,
  maintenanceUrl,
  type YearSelection,
} from '@/lib/financeRouteBuilder'

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
  { value: 'transactions', showYearSelector: true },
  { value: 'duplicates', showYearSelector: true },
  { value: 'linker', showYearSelector: true },
  { value: 'statements', showYearSelector: true },
  { value: 'lots', showYearSelector: false },
  { value: 'summary', showYearSelector: true },
]

export default function AccountNavigation({
  accountId,
  activeTab = 'transactions',
  onYearChange,
}: {
  accountId: number
  activeTab?: string
  onYearChange?: (year: YearSelection) => void
}) {
  const [selectedYear, setSelectedYear] = useState<YearSelection>(() => getEffectiveYear(accountId))

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

  const activeTabItem = TAB_ITEMS.find((item) => item.value === activeTab)
  const showYearSelector = activeTabItem?.showYearSelector ?? false

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border/40">
      <div className="flex items-center gap-4">
        {showYearSelector && (
          <AccountYearSelector
            accountId={accountId}
            onYearChange={onYearChange}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant={activeTab === 'import' ? 'default' : 'outline'}
          size="sm"
          asChild
        >
          <a href={importUrl(accountId)} className="flex items-center gap-1">
            <Upload className="h-4 w-4" />
            Import
          </a>
        </Button>
        <Button
          variant={activeTab === 'maintenance' ? 'default' : 'outline'}
          size="sm"
          asChild
        >
          <a href={maintenanceUrl(accountId)} className="flex items-center gap-1">
            <Settings className="h-4 w-4" />
            Maintenance
          </a>
        </Button>
      </div>
    </div>
  )
}
