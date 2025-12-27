'use client'
import MainTitle from '@/components/MainTitle'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import AccountMaintenanceClient from '@/components/finance/AccountMaintenanceClient'
import { EditAccountFlags } from '@/components/finance/EditAccountFlags'
import { DeleteAccountSection } from '@/components/finance/DeleteAccountSection'

export default function FinanceAccountMaintenancePage({
  accountId,
  accountName,
  whenClosed,
  isDebt,
  isRetirement,
}: {
  accountId: number
  accountName: string
  whenClosed: string | null
  isDebt: boolean
  isRetirement: boolean
}) {
  return (
    <div className="container mx-auto px-4 py-8 w-500">
      <MainTitle>Account Maintenance</MainTitle>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        <div className="lg:col-span-2">
          <AccountMaintenanceClient accountId={accountId} accountName={accountName} whenClosed={whenClosed} />
        </div>
        <div>
          <EditAccountFlags accountId={accountId.toString()} isDebt={isDebt} isRetirement={isRetirement} />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
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
        <div className="border-t lg:border-t-0 lg:border-l lg:pl-8 pt-8 lg:pt-0">
          <h2 className="text-2xl font-bold mb-4">Danger Zone</h2>
          <DeleteAccountSection accountId={accountId} />
        </div>
      </div>
    </div>
  )
}
