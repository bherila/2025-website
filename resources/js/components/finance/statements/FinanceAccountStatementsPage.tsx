'use client'
import { Download, Paperclip, Pencil, TableProperties, Trash2 as Delete } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { DeleteFileModal, FileList, FileUploadButton, useFileManagement } from '@/components/shared/FileManager'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { fetchWrapper } from '@/fetchWrapper'

import { type StatementDetail, StatementDetailsModal, type StatementInfo } from '../StatementDetailsModal';
import AccountStatementsChart from './AccountStatementsChart'
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

  // Memoize file management options to prevent object identity changes each render
  const fileManagerOptions = useMemo(() => ({
    listUrl: `/api/finance/${id}/files`,
    uploadUrl: `/api/finance/${id}/files`,
    downloadUrlPattern: (fileId: number) => `/api/finance/${id}/files/${fileId}/download`,
    deleteUrlPattern: (fileId: number) => `/api/finance/${id}/files/${fileId}`,
  }), [id])

  const fileManager = useFileManagement(fileManagerOptions)

  const fetchData = useCallback(async () => {
    try {
      const fetchedData = await fetchWrapper.get(`/api/finance/${id}/balance-timeseries`)
      setStatements(fetchedData)
      setIsLoading(false)
    } catch (error) {
      console.error('Error fetching statements:', error)
      setStatements([])
      setIsLoading(false)
    }
  }, [id])

  // Fetch statements on mount
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Fetch files once on mount (separate from statements to avoid coupling)
  useEffect(() => {
    fileManager.fetchFiles()
    // Only run on mount — fetchFiles identity is stable when listUrl doesn't change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Memoize chart data to prevent re-rendering the chart on every parent render
  const balanceHistory = useMemo(() =>
    statements?.map((s) => [
      new Date(s.statement_closing_date).valueOf(),
      parseFloat(s.balance),
    ] as [number, number]) ?? [],
    [statements]
  )

  const statementHistory = useMemo(() =>
    statements?.map((statement, index) => {
      const prev = statements[index - 1]
      const bal = parseFloat(statement.balance);
      const prevBal = prev ? parseFloat(prev.balance) : 0;
      const change = bal - prevBal;
      const percentChange = prevBal !== 0 ? (change / prevBal) * 100 : 0;

      return {
        statement_id: statement.statement_id,
        statement_closing_date: statement.statement_closing_date,
        date: new Date(statement.statement_closing_date),
        balance: bal,
        originalBalance: statement.balance,
        change,
        percentChange,
        lineItemCount: statement.lineItemCount,
        original: statement,
      }
    }) ?? [],
    [statements]
  );

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
      fetchData();
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
      fetchData();
      setModalOpen(false);
    } catch (error) {
      console.error(`Error ${selectedStatement ? 'updating' : 'adding'} balance snapshot:`, error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadCSV = useCallback(() => {
    const csvContent = 'Date,Balance\n' + statementHistory.map(row => `${row.date.toISOString().split('T')[0]},${row.balance}`).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${id}_statements.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [id, statementHistory]);

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
        <p className="mb-6">This account doesn&apos;t have any statements yet.</p>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex justify-end gap-2 mb-2 px-8">
        <Button onClick={() => setIsAllStatementsModalOpen(true)} variant="outline" size="sm">
          <TableProperties className="h-4 w-4 mr-1" />
          View All Statements
        </Button>
        <Button onClick={handleDownloadCSV} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-1" />
          Download CSV
        </Button>
      </div>
      <AccountStatementsChart balanceHistory={balanceHistory} />
      <div>
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
