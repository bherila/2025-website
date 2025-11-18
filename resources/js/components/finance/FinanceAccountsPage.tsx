import { useEffect, useState } from 'react'
import MainTitle from '../MainTitle'
import { Button } from '@/components/ui/button'
import Link from '../link'
import AccountGrouping from './AccountGrouping'
import NewAccountForm from './NewAccountForm'
import StackedBalanceChart from '../StackedBalanceChart'
import { Skeleton } from '@/components/ui/skeleton'

interface Account {
  acct_id: number
  acct_name: string
  acct_last_balance: string
  when_closed: Date | null
  acct_last_balance_date: Date | null
}

export default function FinanceAccountsPage() {
  const [data, setData] = useState<{
    assetAccounts: Account[]
    liabilityAccounts: Account[]
    retirementAccounts: Account[]
    activeChartAccounts: Account[]
  } | null>(null)
  const [chartData, setChartData] = useState<{
    data: (string | number)[][]
    labels: string[]
    isNegative: boolean[]
    isRetirement: boolean[]
  } | null>(null)

  const fetchData = async () => {
    const response = await fetch('/api/finance/accounts')
    if (response.ok) {
      const json = await response.json()
      // Parse dates
      const parseAccounts = (accounts: any[]) => accounts.map(acc => ({
        ...acc,
        when_closed: acc.when_closed ? new Date(acc.when_closed) : null,
        acct_last_balance_date: acc.acct_last_balance_date ? new Date(acc.acct_last_balance_date) : null,
      }))
      setData({
        assetAccounts: parseAccounts(json.assetAccounts),
        liabilityAccounts: parseAccounts(json.liabilityAccounts),
        retirementAccounts: parseAccounts(json.retirementAccounts),
        activeChartAccounts: parseAccounts(json.activeChartAccounts),
      })
    }
  }

  const fetchChartData = async () => {
    const response = await fetch('/api/finance/chart')
    if (response.ok) {
      const json = await response.json()
      setChartData(json)
    }
  }

  useEffect(() => {
    fetchData()
    fetchChartData()
  }, [])

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-1/4" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="mb-8 mt-4">
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="w-full flex flex-col sm:flex-row sm:justify-between sm:space-x-4 space-y-4 sm:space-y-0">
          <div className="w-full space-y-4">
            <div className="space-y-2">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
          </div>
          <div className="w-full sm:w-1/3">
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center">
        <MainTitle>Accounting</MainTitle>
        <Button asChild>
          <Link href="/finance/tags">Manage Tags</Link>
        </Button>
      </div>
      <div className="mb-8">
        {chartData && <StackedBalanceChart {...chartData} />}
      </div>
      <div className="w-full flex flex-col sm:flex-row sm:justify-between sm:space-x-4 space-y-4 sm:space-y-0">
        <div className="w-full space-y-4">
          <AccountGrouping title="Assets" accounts={data.assetAccounts} onUpdate={() => { fetchData(); fetchChartData(); }} />
          <AccountGrouping title="Liabilities" accounts={data.liabilityAccounts} onUpdate={() => { fetchData(); fetchChartData(); }} />
          <AccountGrouping title="Retirement" accounts={data.retirementAccounts} onUpdate={() => { fetchData(); fetchChartData(); }} />
        </div>
        <NewAccountForm onUpdate={() => { fetchData(); fetchChartData(); }} />
      </div>
    </div>
  )
}
