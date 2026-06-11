'use client'
import { Settings, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { FINANCE_ACCOUNT_TOOLS } from '@/lib/financeNavigation'
import {
  getEffectiveYear,
  importUrl,
  maintenanceUrl,
  type YearSelection,
} from '@/lib/financeRouteBuilder'

import AccountYearSelector from './AccountYearSelector'

export { useFinanceAccounts } from './useFinanceAccounts'

const TAB_ITEMS = FINANCE_ACCOUNT_TOOLS
  .filter((tool) => tool.visibleInNavbarTabs)
  .map((tool) => ({
    value: tool.id,
    title: tool.label,
    showYearSelector: tool.preserveYear && tool.id !== 'lots',
  }))

export default function AccountNavigation({
  accountId,
  activeTab = 'transactions',
  onYearChange,
}: {
  accountId: number | 'all'
  activeTab?: string
  onYearChange?: (year: YearSelection) => void
}) {
  const [selectedYear, setSelectedYear] = useState<YearSelection>(() =>
    typeof accountId === 'number' ? getEffectiveYear(accountId) : 'all'
  )

  useEffect(() => {
    const handleYearChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ accountId: number; year: YearSelection }>
      if (typeof accountId === 'number' && customEvent.detail.accountId === accountId) {
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
        {showYearSelector && typeof accountId === 'number' && (
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
        {typeof accountId === 'number' && (
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
        )}
      </div>
    </div>
  )
}
