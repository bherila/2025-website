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
import { Trash2 as Delete, Paperclip, Pencil } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip'

import StatementDetailModal from './StatementDetailModal';
import AllStatementsModal from './AllStatementsModal';

interface StatementSnapshot {
  snapshot_id: number;
  when_added: string;
  balance: string;
  lineItemCount: number;
}

interface StatementDetailModalState {
  isOpen: boolean;
  snapshotId: number | null;
}

export default function FinanceAccountStatementsPage({ id }: { id: number }) {
  const [statements, setStatements] = useState<StatementSnapshot[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fetchKey, setFetchKey] = useState(0); // Used to trigger re-fetch
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<StatementSnapshot | null>(null);
  const [currentBalance, setCurrentBalance] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [statementDetailModal, setStatementDetailModal] = useState<StatementDetailModalState>({ isOpen: false, snapshotId: null });
  const [isAllStatementsModalOpen, setIsAllStatementsModalOpen] = useState(false);


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
      lineItemCount: statement.lineItemCount,
      original: statement,
    }
  }) || [];

  const handleOpenModal = (statement: StatementSnapshot | null = null) => {
    setSelectedStatement(statement);
    if (statement) {
      setCurrentBalance(statement.balance);
      setCurrentDate(statement.when_added.split(' ')[0] ?? '');
    } else {
      setCurrentBalance('');
      setCurrentDate('');
    }
    setModalOpen(true);
  };

  const handleDeleteSnapshot = async (when_added: string, balance: string) => {
    try {
      await fetchWrapper.delete(`/api/finance/${id}/balance-timeseries`, { when_added, balance });
      setFetchKey(prev => prev + 1); // Trigger re-fetch
    } catch (error) {
      console.error('Error deleting balance snapshot:', error);
    }
  };

  const handleFormSubmit = async () => {
    if (!currentDate || !currentBalance || isSubmitting) return;
    setIsSubmitting(true);
    const url = selectedStatement
      ? `/api/finance/balance-timeseries/${selectedStatement.snapshot_id}`
      : `/api/finance/${id}/balance-timeseries`;
    const method = selectedStatement ? 'put' : 'post';

    try {
      await fetchWrapper[method](url, { balance: currentBalance, when_added: currentDate });
      setFetchKey(prev => prev + 1);
      setModalOpen(false);
    } catch (error) {
      console.error(`Error ${selectedStatement ? 'updating' : 'adding'} balance snapshot:`, error);
    } finally {
      setIsSubmitting(false);
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
    <TooltipProvider>
      <AccountStatementsChart balanceHistory={statements.map((balance) => [new Date(balance.when_added).valueOf(), parseFloat(balance.balance)])} />
      <div className="relative">
        <div className="absolute top-0 right-0 z-10 flex gap-2">
          <Button onClick={() => setIsAllStatementsModalOpen(true)} variant="outline">
            View All Statements
          </Button>
          <Button onClick={handleDownloadCSV} variant="outline">
            Download CSV
          </Button>
        </div>
        <Table className="container mx-auto">
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={() => handleOpenModal(row.original)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Edit Balance</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={row.lineItemCount > 0 ? 'default' : 'outline'}
                        className={row.lineItemCount > 0 ? 'bg-green-500 text-white hover:bg-green-600' : ''}
                        size="sm"
                        onClick={() => setStatementDetailModal({ isOpen: true, snapshotId: row.snapshot_id })}
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Statement Details</p>
                    </TooltipContent>
                  </Tooltip>
                  <AlertDialog>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Delete className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete</p>
                      </TooltipContent>
                    </Tooltip>
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
                <Button variant="outline" size="sm" onClick={() => handleOpenModal()}>
                  Add
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent>
            <DialogTitle>{selectedStatement ? 'Edit' : 'Add New'} Balance Snapshot</DialogTitle>
            <DialogDescription>
              {selectedStatement ? 'Update the balance for the snapshot.' : 'Enter the date and balance for the new snapshot. Both fields are required.'}
            </DialogDescription>
            <div className="space-y-4 mt-4">
              <div className="flex items-center gap-4">
                <label htmlFor="balance-date" className="w-16">Date:</label>
                <input
                  id="balance-date"
                  type="date"
                  value={currentDate}
                  onChange={(e) => setCurrentDate(e.target.value)}
                  className="border p-2 rounded flex-1"
                  required
                  disabled={!!selectedStatement}
                />
              </div>
              <div className="flex items-center gap-4">
                <label htmlFor="balance-amount" className="w-16">Balance:</label>
                <input
                  id="balance-amount"
                  type="number"
                  step="0.01"
                  value={currentBalance}
                  onChange={(e) => setCurrentBalance(e.target.value)}
                  placeholder="Balance"
                  className="border p-2 rounded flex-1"
                  required
                />
              </div>
              <div className="flex justify-end">
                <Button 
                  onClick={handleFormSubmit} 
                  disabled={!currentDate || !currentBalance || isSubmitting}
                >
                  {isSubmitting ? 'Submitting...' : (selectedStatement ? 'Update Snapshot' : 'Add Snapshot')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {statementDetailModal.isOpen && statementDetailModal.snapshotId && (
          <StatementDetailModal
            snapshotId={statementDetailModal.snapshotId}
            isOpen={statementDetailModal.isOpen}
            onClose={() => setStatementDetailModal({ isOpen: false, snapshotId: null })}
          />
        )}
        {isAllStatementsModalOpen && (
          <AllStatementsModal
            accountId={id}
            isOpen={isAllStatementsModalOpen}
            onClose={() => setIsAllStatementsModalOpen(false)}
          />
        )}
      </div>
    </TooltipProvider>
  )
}
