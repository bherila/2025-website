import { useEffect, useState } from 'react'
import MainTitle from '@/components/MainTitle'
import { Button } from '@/components/ui/button'
import Link from '@/components/link'
import AccountGrouping from '@/components/finance/AccountGrouping'
import NewAccountForm from '@/components/finance/NewAccountForm'
import StackedBalanceChart from '@/components/finance/StackedBalanceChart'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

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
  const [isModalOpen, setIsModalOpen] = useState(false)

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
        <div className="flex space-x-2">
          <Button onClick={() => setIsModalOpen(true)}>New Account</Button>
          <Button asChild>
            <Link href="/finance/tags">Manage Tags</Link>
          </Button>
        </div>
      </div>
      <div className="mb-8">
        {chartData && <StackedBalanceChart {...chartData} />}
      </div>
      <div className="w-full space-y-4">
        <AccountGrouping title="Assets" accounts={data.assetAccounts} onUpdate={() => { fetchData(); fetchChartData(); }} />
        <AccountGrouping title="Liabilities" accounts={data.liabilityAccounts} onUpdate={() => { fetchData(); fetchChartData(); }} />
        <AccountGrouping title="Retirement" accounts={data.retirementAccounts} onUpdate={() => { fetchData(); fetchChartData(); }} />
      </div>
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Account</DialogTitle>
          </DialogHeader>
          <NewAccountForm onUpdate={() => { fetchData(); fetchChartData(); setIsModalOpen(false); }} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
