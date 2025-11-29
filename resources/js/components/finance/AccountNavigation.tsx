'use client'
import { useState, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import AccountYearSelector from './AccountYearSelector'
import { 
  getTabUrl, 
  importUrl, 
  maintenanceUrl, 
  accountsUrl,
  getEffectiveYear,
  type YearSelection 
} from '@/lib/financeRouteBuilder'
import { Upload, Settings } from 'lucide-react'

// Tabs that show year selector
const TAB_ITEMS = [
  { value: 'transactions', title: 'Transactions', showYearSelector: true },
  { value: 'duplicates', title: 'Duplicates', showYearSelector: true },
  { value: 'linker', title: 'Linker', showYearSelector: true },
  { value: 'statements', title: 'Statements', showYearSelector: true },
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
              Account {accountId} - {accountName ?? 'no name'}
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