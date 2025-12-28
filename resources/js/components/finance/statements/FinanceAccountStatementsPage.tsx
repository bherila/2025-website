'use client'
import { useEffect, useState, useCallback } from 'react'
import { fetchWrapper } from '@/fetchWrapper'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table'
import AccountStatementsChart from './AccountStatementsChart'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Trash2 as Delete, Paperclip, Pencil } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileList, FileUploadButton, DeleteFileModal, useFileManagement } from '@/components/shared/FileManager'

import { StatementDetailsModal, type StatementInfo, type StatementDetail } from '../StatementDetailsModal';
import AllStatementsModal from './AllStatementsModal';

interface StatementSnapshot {
  statement_id: number;
  statement_opening_date: string | null;
  statement_closing_date: string;
  balance: string;
  lineItemCount: number;
}

interface StatementDetailModalState {
  isOpen: boolean;
  statementId: number | null;
  statementInfo?: StatementInfo;
  statementDetails: StatementDetail[];
  isLoading: boolean;
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
  const [statementDetailModal, setStatementDetailModal] = useState<StatementDetailModalState>({ 
    isOpen: false, 
    statementId: null,
    statementDetails: [],
    isLoading: false,
  });
  const [isAllStatementsModalOpen, setIsAllStatementsModalOpen] = useState(false);

  // File management
  const fileManager = useFileManagement({
    listUrl: `/api/finance/${id}/files`,
    uploadUrl: `/api/finance/${id}/files`,
    downloadUrlPattern: (fileId) => `/api/finance/${id}/files/${fileId}/download`,
    deleteUrlPattern: (fileId) => `/api/finance/${id}/files/${fileId}`,
  })

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
    fileManager.fetchFiles()
  }, [id, fetchKey])

  const statementHistory = statements?.map((statement, index) => {
    const prev = statements[index - 1]
    const currentBalance = parseFloat(statement.balance);
    const prevBalance = prev ? parseFloat(prev.balance) : 0;

    const change = currentBalance - prevBalance;
    const percentChange = prevBalance !== 0 ? (change / prevBalance) * 100 : 0;

    return {
      statement_id: statement.statement_id,
      statement_closing_date: statement.statement_closing_date,
      date: new Date(statement.statement_closing_date),
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
      setCurrentDate(statement.statement_closing_date.split(' ')[0] ?? '');
    } else {
      setCurrentBalance('');
      setCurrentDate('');
    }
    setModalOpen(true);
  };

  const handleOpenStatementDetailModal = useCallback(async (statementId: number) => {
    setStatementDetailModal({
      isOpen: true,
      statementId,
      statementDetails: [],
      isLoading: true,
    });

    try {
      const data = await fetchWrapper.get(`/api/finance/statement/${statementId}/details`);
      setStatementDetailModal(prev => ({
        ...prev,
        statementInfo: data.statementInfo,
        statementDetails: data.statementDetails || [],
        isLoading: false,
      }));
    } catch (error) {
      console.error('Error fetching statement details:', error);
      setStatementDetailModal(prev => ({
        ...prev,
        statementDetails: [],
        isLoading: false,
      }));
    }
  }, []);

  const handleCloseStatementDetailModal = useCallback(() => {
    setStatementDetailModal({
      isOpen: false,
      statementId: null,
      statementDetails: [],
      isLoading: false,
    });
  }, []);

  const handleDeleteSnapshot = async (statement_closing_date: string, balance: string) => {
    try {
      await fetchWrapper.delete(`/api/finance/${id}/balance-timeseries`, { statement_closing_date, balance });
      setFetchKey(prev => prev + 1); // Trigger re-fetch
    } catch (error) {
      console.error('Error deleting balance snapshot:', error);
    }
  };

  const handleFormSubmit = async () => {
    if (!currentDate || !currentBalance || isSubmitting) return;
    setIsSubmitting(true);
    const url = selectedStatement
      ? `/api/finance/balance-timeseries/${selectedStatement.statement_id}`
      : `/api/finance/${id}/balance-timeseries`;
    const method = selectedStatement ? 'put' : 'post';

    try {
      await fetchWrapper[method](url, { balance: currentBalance, statement_closing_date: currentDate });
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
      <AccountStatementsChart balanceHistory={statements.map((balance) => [new Date(balance.statement_closing_date).valueOf(), parseFloat(balance.balance)])} />
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
              <TableRow key={row.statement_closing_date + '-' + row.balance + '-' + index}>
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
                        onClick={() => handleOpenStatementDetailModal(row.statement_id)}
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
                          <Button variant="destructive" onClick={() => handleDeleteSnapshot(row.statement_closing_date, row.originalBalance)}>
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
        {statementDetailModal.isOpen && (
          statementDetailModal.isLoading ? (
            <Dialog open={true} onOpenChange={handleCloseStatementDetailModal}>
              <DialogContent className="flex justify-center items-center h-40">
                <Spinner />
              </DialogContent>
            </Dialog>
          ) : (
            <StatementDetailsModal
              isOpen={statementDetailModal.isOpen}
              onClose={handleCloseStatementDetailModal}
              statementInfo={statementDetailModal.statementInfo}
              statementDetails={statementDetailModal.statementDetails}
            />
          )
        )}
        {isAllStatementsModalOpen && (
          <AllStatementsModal
            accountId={id}
            isOpen={isAllStatementsModalOpen}
            onClose={() => setIsAllStatementsModalOpen(false)}
          />
        )}

        {/* Account Files Section */}
        <FileList
          className="mt-8"
          files={fileManager.files}
          loading={fileManager.loading}
          isAdmin={true}
          onDownload={fileManager.downloadFile}
          onDelete={fileManager.handleDeleteRequest}
          title="Statement Files"
          actions={<FileUploadButton onUpload={fileManager.uploadFile} />}
        />

        <DeleteFileModal
          file={fileManager.deleteFile}
          isOpen={fileManager.deleteModalOpen}
          isDeleting={fileManager.isDeleting}
          onClose={fileManager.closeDeleteModal}
          onConfirm={fileManager.handleDeleteConfirm}
        />
      </div>
    </TooltipProvider>
  )
}
