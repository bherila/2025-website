'use client'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'

const NAV_ITEMS = [
  {
    value: 'transactions',
    title: 'Transactions',
    href: (accountId: number) => `/finance/${accountId}`,
  },
  {
    value: 'import',
    title: 'Import',
    href: (accountId: number) => `/finance/${accountId}/import-transactions`,
  },
  {
    value: 'duplicates',
    title: 'Duplicates',
    href: (accountId: number) => `/finance/${accountId}/duplicates`,
  },
  {
    value: 'summary',
    title: 'Summary',
    href: (accountId: number) => `/finance/${accountId}/summary`,
  },
  {
    value: 'balance-timeseries',
    title: 'Balance History',
    href: (accountId: number) => `/finance/${accountId}/balance-timeseries`,
  },
  {
    value: 'maintenance',
    title: 'Maintenance',
    href: (accountId: number) => `/finance/${accountId}/maintenance`,
  },
]

export default function AccountNavigation({
  accountId,
  accountName,
  activeTab = 'transactions',
}: {
  accountId: number
  accountName: string
  activeTab?: string
}) {
  const activeTabTitle = NAV_ITEMS.find((item) => item.value === activeTab)?.title || ''

  return (
    <div className="mt-4 px-8">
      <div className="py-4 px-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/finance">Accounts</BreadcrumbLink>
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

      <Tabs defaultValue={activeTab} className="mb-3">
        <TabsList>
          {NAV_ITEMS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} asChild>
              <a href={item.href(accountId)}>{item.title}</a>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}