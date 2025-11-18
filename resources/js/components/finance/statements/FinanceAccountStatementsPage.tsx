'use client'
import { useEffect, useState } from 'react'
import { fetchWrapper } from '../../../fetchWrapper'
import { Spinner } from '../../ui/spinner'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../../ui/table'
import AccountStatementsChart from './AccountStatementsChart'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '../../ui/alert-dialog'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../../ui/dialog'
import { Button } from '../../ui/button'
import { Trash2 as Delete, Paperclip } from 'lucide-react'

interface StatementSnapshot {
  snapshot_id: number;
  when_added: string;
  balance: string;
}

export default function FinanceAccountStatementsPage({ id }: { id: number }) {
  const [statements, setStatements] = useState<StatementSnapshot[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchKey, setFetchKey] = useState(0); // Used to trigger re-fetch
  const [newBalance, setNewBalance] = useState('')
  const [newDate, setNewDate] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isAddingSnapshot, setIsAddingSnapshot] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const fetchedData = await fetchWrapper.get(`/api/finance/${id}/balance-timeseries`)
        setStatements(fetchedData)
        setIsLoading(false)
      } catch (error) {
        console.error('Error fetching statements:', error)
        setStatements([])
        setIsLoading(false)
      }
    }
    fetchData()
  }, [id, fetchKey])

  const statementHistory = statements?.map((statement, index) => {
    const prev = statements[index - 1]
    const currentBalance = parseFloat(statement.balance);
    const prevBalance = prev ? parseFloat(prev.balance) : 0;

    const change = currentBalance - prevBalance;
    const percentChange = prevBalance !== 0 ? (change / prevBalance) * 100 : 0;

    return {
      snapshot_id: statement.snapshot_id,
      when_added: statement.when_added,
      date: new Date(statement.when_added),
      balance: currentBalance,
      originalBalance: statement.balance,
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

  const handleAddSnapshot = async () => {
    if (!newDate || !newBalance || isAddingSnapshot) return;
    setIsAddingSnapshot(true);
    try {
      await fetchWrapper.post(`/api/finance/${id}/balance-timeseries`, { balance: newBalance, when_added: newDate });
      setFetchKey(prev => prev + 1); // Trigger re-fetch
      setNewBalance('');
      setNewDate('');
      setIsAddModalOpen(false);
    } catch (error) {
      console.error('Error adding balance snapshot:', error);
    } finally {
      setIsAddingSnapshot(false);
    }
  };

  const handleDownloadCSV = () => {
    const csvContent = 'Date,Balance\n' + statementHistory.map(row => `${row.date.toISOString().split('T')[0]},${row.balance}`).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${id}_statements.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center">
        <Spinner />
      </div>
    )
  }

  if (!statements || statements.length === 0) {
    return (
      <div className="text-center p-8 bg-muted rounded-lg">
        <h2 className="text-xl font-semibold mb-4">No Statements Found</h2>
        <p className="mb-6">This account doesn't have any statements yet.</p>
      </div>
    )
  }

  return (
    <>
      <AccountStatementsChart balanceHistory={statements.map((balance) => [new Date(balance.when_added).valueOf(), parseFloat(balance.balance)])} />
      <div className="relative">
        <Button onClick={handleDownloadCSV} variant="outline" className="absolute top-0 right-0 z-10">
          Download CSV
        </Button>
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
            {statementHistory.map((row, index) => (
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
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/finance/statement/${row.snapshot_id}`}>
                      <Paperclip className="h-4 w-4" />
                    </a>
                  </Button>
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
            <TableRow>
              <TableCell colSpan={4} className="text-center font-semibold">
                Add New Snapshot
              </TableCell>
              <TableCell className="text-center">
                <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogTitle>Add New Balance Snapshot</DialogTitle>
                    <DialogDescription id="add-snapshot-description">
                      Enter the date and balance for the new snapshot. Both fields are required.
                    </DialogDescription>
                    <div className="space-y-4 mt-4">
                      <div className="flex items-center gap-4">
                        <label htmlFor="balance-date" className="w-16">Date:</label>
                        <input
                          id="balance-date"
                          type="date"
                          value={newDate}
                          onChange={(e) => setNewDate(e.target.value)}
                          className="border p-2 rounded flex-1"
                          required
                        />
                      </div>
                      <div className="flex items-center gap-4">
                        <label htmlFor="balance-amount" className="w-16">Balance:</label>
                        <input
                          id="balance-amount"
                          type="number"
                          step="0.01"
                          value={newBalance}
                          onChange={(e) => setNewBalance(e.target.value)}
                          placeholder="Balance"
                          className="border p-2 rounded flex-1"
                          required
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button 
                          onClick={handleAddSnapshot} 
                          disabled={!newDate || !newBalance || isAddingSnapshot}
                          aria-describedby="add-snapshot-description"
                        >
                          {isAddingSnapshot ? 'Adding...' : 'Add Snapshot'}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </>
  )
}
