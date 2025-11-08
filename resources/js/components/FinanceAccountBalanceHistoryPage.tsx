'use client'
import { useEffect, useState } from 'react'
import { fetchWrapper } from '../fetchWrapper'
import { Spinner } from './ui/spinner'
import { Table, TableBody, TableCell, TableHeader, TableRow } from './ui/table'
import AccountBalanceHistory from './AccountBalanceHistory'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from './ui/alert-dialog'
import { Button } from './ui/button'
import { Trash2 as Delete } from 'lucide-react'

interface BalanceSnapshot {
  when_added: string;
  balance: string;
}

export default function FinanceAccountBalanceHistoryPage({ id }: { id: number }) {
  const [balances, setBalances] = useState<BalanceSnapshot[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchKey, setFetchKey] = useState(0); // Used to trigger re-fetch

  useEffect(() => {
    const fetchData = async () => {
      try {
        const fetchedData = await fetchWrapper.get(`/api/finance/${id}/balance-timeseries`)
        setBalances(fetchedData)
        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching balance history:', error)
        setBalances([])
        setIsLoading(false)
      }
    }
    fetchData()
  }, [id, fetchKey])

  const balanceHistory = balances?.map((balance, index) => {
    const prev = balances[index - 1]
    const currentBalance = parseFloat(balance.balance);
    const prevBalance = prev ? parseFloat(prev.balance) : 0;

    const change = currentBalance - prevBalance;
    const percentChange = prevBalance !== 0 ? (change / prevBalance) * 100 : 0;

    return {
      when_added: balance.when_added,
      date: new Date(balance.when_added),
      balance: currentBalance,
      originalBalance: balance.balance,
      change: change,
      percentChange: percentChange,
    }
  }) || [];

  const handleDeleteSnapshot = async (when_added: string, balance: string) => {
    try {
      await fetchWrapper.delete(`/api/finance/${id}/balance-timeseries`, { when_added, balance });
      setFetchKey(prev => prev + 1); // Trigger re-fetch
    } catch (error) {
      console.error('Error deleting balance snapshot:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center">
        <Spinner />
      </div>
    )
  }

  if (!balances || balances.length === 0) {
    return (
      <div className="text-center p-8 bg-muted rounded-lg">
        <h2 className="text-xl font-semibold mb-4">No Balance History Found</h2>
        <p className="mb-6">This account doesn't have any balance snapshots yet.</p>
      </div>
    )
  }

  return (
    <>
      <AccountBalanceHistory balanceHistory={balances.map((balance) => [new Date(balance.when_added).valueOf(), parseFloat(balance.balance)])} />
      <Table className="container mx-auto w-[500px]">
        <TableHeader>
          <TableRow>
            <TableCell className="text-right">Date</TableCell>
            <TableCell className="text-right">Balance</TableCell>
            <TableCell className="text-right">Change</TableCell>
            <TableCell className="text-right">% Change</TableCell>
            <TableCell className="text-center">Actions</TableCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {balanceHistory.map((row, index) => (
            <TableRow key={row.when_added + '-' + row.balance + '-' + index}>
              <TableCell className="text-right">
                {row.date.toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </TableCell>
              <TableCell className="text-right">{row.balance.toFixed(2)}</TableCell>
              <TableCell className="text-right" style={{ color: row.change < 0 ? 'red' : undefined }}>
                {row.change.toFixed(2)}
              </TableCell>
              <TableCell className="text-right" style={{ color: row.percentChange < 0 ? 'red' : undefined }}>
                {row.percentChange.toFixed(2)}%
              </TableCell>
              <TableCell className="text-center">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Delete className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this balance snapshot? This action cannot be undone.
                    </AlertDialogDescription>
                    <div className="flex justify-end gap-4 mt-6">
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction asChild>
                        <Button variant="destructive" onClick={() => handleDeleteSnapshot(row.when_added, row.originalBalance)}>
                          Delete
                        </Button>
                      </AlertDialogAction>
                    </div>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  )
}
