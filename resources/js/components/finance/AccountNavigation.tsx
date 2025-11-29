'use client'
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
import AccountYearSelector, { type YearSelection } from './AccountYearSelector'
import { Upload, Settings } from 'lucide-react'

// Tabs that show year selector
const TAB_ITEMS = [
  {
    value: 'transactions',
    title: 'Transactions',
    href: (accountId: number) => `/finance/${accountId}`,
    showYearSelector: true,
  },
  {
    value: 'duplicates',
    title: 'Duplicates',
    href: (accountId: number) => `/finance/${accountId}/duplicates`,
    showYearSelector: true,
  },
  {
    value: 'statements',
    title: 'Statements',
    href: (accountId: number) => `/finance/${accountId}/statements`,
    showYearSelector: true,
  },
  {
    value: 'summary',
    title: 'Summary',
    href: (accountId: number) => `/finance/${accountId}/summary`,
    showYearSelector: true,
  },
]

// Button actions (no year selector)
const ACTION_ITEMS = [
  {
    value: 'import',
    title: 'Import',
    href: (accountId: number) => `/finance/${accountId}/import-transactions`,
    icon: Upload,
  },
  {
    value: 'maintenance',
    title: 'Maintenance',
    href: (accountId: number) => `/finance/${accountId}/maintenance`,
    icon: Settings,
  },
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
  const activeTabTitle = ALL_NAV_ITEMS.find((item) => item.value === activeTab)?.title || ''
  const activeTabItem = TAB_ITEMS.find((item) => item.value === activeTab)
  const showYearSelector = activeTabItem?.showYearSelector ?? false

  return (
    <div className="mt-4 px-8">
      <div className="py-4 px-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/finance/accounts">Accounts</BreadcrumbLink>
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
                  <a href={item.href(accountId)}>{item.title}</a>
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
              <a href={item.href(accountId)} className="flex items-center gap-1">
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