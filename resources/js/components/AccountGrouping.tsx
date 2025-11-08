import { Badge } from '@/components/ui/badge'
import { formatDistance } from 'date-fns'
import { TableHeader, TableRow, TableHead, TableBody, TableFooter, TableCell } from '@/components/ui/table'
import { Table } from '@/components/ui/table'
import currency from 'currency.js'
import EditBalanceDisplay from './EditBalanceDisplay'
import Link from '@/components/link'

interface AccountGroupingItem {
  when_closed: Date | null
  acct_last_balance: string
  acct_id: number
  acct_name: string
  acct_last_balance_date: Date | null
}

function isAccountClosed(account: AccountGroupingItem) {
  return !!account.when_closed
}

// Calculate totals for each category (only for active accounts)
const calculateCategoryTotal = (categoryAccounts: AccountGroupingItem[]): currency => {
  return categoryAccounts
    .filter((account) => !account.when_closed)
    .reduce((total, account) => {
      return total.add(currency(account.acct_last_balance || 0))
    }, currency(0))
}

export default function AccountGrouping({ title, accounts, onUpdate }: { title: string; accounts: AccountGroupingItem[]; onUpdate: () => void }) {
  return (
    <>
      <h2 className="text-xl font-semibold mt-8">{title}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account Name</TableHead>
            <TableHead className="text-right" style={{ textAlign: 'right', width: '150px' }}>
              Last Balance
            </TableHead>
            <TableHead className="text-right whitespace-nowrap w-0" style={{ width: '150px' }}>
              Last update
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account.acct_id} className="border-b-0 py-1">
              <TableCell>
                <Link href={`/finance/${account.acct_id}`}>{account.acct_name}</Link>
                {isAccountClosed(account) ? (
                  <Badge variant="secondary" className="ml-2">
                    Closed
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="text-right">
                <EditBalanceDisplay
                  acct_id={account.acct_id}
                  defaultBalance={currency(account.acct_last_balance).toString()}
                  onUpdate={onUpdate}
                />
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {formatDistance(new Date(), account.acct_last_balance_date ?? new Date())}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>
              <strong>Total {title}</strong>
            </TableCell>
            <TableCell className="text-right">
              <strong>{calculateCategoryTotal(accounts).format()}</strong>
            </TableCell>
            <TableCell></TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </>
  )
}