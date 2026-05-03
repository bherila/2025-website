'use client'
import AccountMaintenanceClient from '@/components/finance/AccountMaintenanceClient'
import { DeleteAccountSection } from '@/components/finance/DeleteAccountSection'
import { EditAccountFlags } from '@/components/finance/EditAccountFlags'
import MainTitle from '@/components/MainTitle'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function FinanceAccountMaintenancePage({
  accountId,
  accountName,
  whenClosed,
  isDebt,
  isRetirement,
  acctNumber,
}: {
  accountId: number
  accountName: string
  whenClosed: string | null
  isDebt: boolean
  isRetirement: boolean
  acctNumber: string | null
}) {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <MainTitle>Account Maintenance</MainTitle>
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] lg:items-start">
        <div>
          <AccountMaintenanceClient accountId={accountId} accountName={accountName} whenClosed={whenClosed} />
        </div>
        <div>
          <EditAccountFlags accountId={accountId.toString()} isDebt={isDebt} isRetirement={isRetirement} acctNumber={acctNumber} />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div>
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Deleted Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mt-3">No deleted transactions found.</p>
            </CardContent>
          </Card>
        </div>
        <div>
          <DeleteAccountSection accountId={accountId} />
        </div>
      </div>
    </div>
  )
}
