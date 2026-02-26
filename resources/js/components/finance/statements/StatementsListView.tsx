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
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { fetchWrapper } from '@/fetchWrapper'

import AccountStatementsChart from './AccountStatementsChart'
import AllStatementsModal from './AllStatementsModal'

export interface StatementSnapshot {
  statement_id: number
  statement_opening_date: string | null
  statement_closing_date: string
  balance: string
  lineItemCount: number
}

interface StatementsListViewProps {
  accountId: number
  statements: StatementSnapshot[]
  onRefresh: () => void
  onViewDetail: (statementId: number) => void
}

export default function StatementsListView({
  accountId,
  statements,
  onRefresh,
  onViewDetail,
}: StatementsListViewProps) {
  const [showChart, setShowChart] = useState(() => {
    try {
      return localStorage.getItem('finance_statements_chart_visible') === 'true'
    } catch {
      return false
    }
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedStatement, setSelectedStatement] = useState<StatementSnapshot | null>(null)
  const [currentBalance, setCurrentBalance] = useState('')
  const [currentDate, setCurrentDate] = useState('')
  const [isAllStatementsModalOpen, setIsAllStatementsModalOpen] = useState(false)

  // Memoize file management options to prevent object identity changes each render
  const fileManagerOptions = useMemo(() => ({
    listUrl: `/api/finance/${accountId}/files`,
    uploadUrl: `/api/finance/${accountId}/files`,
    downloadUrlPattern: (fileId: number) => `/api/finance/${accountId}/files/${fileId}/download`,
    deleteUrlPattern: (fileId: number) => `/api/finance/${accountId}/files/${fileId}`,
  }), [accountId])

  const fileManager = useFileManagement(fileManagerOptions)

  // Fetch files on mount
  useEffect(() => {
    fileManager.fetchFiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Memoize chart data
  const balanceHistory = useMemo(() =>
    statements.map((s) => [
      new Date(s.statement_closing_date).valueOf(),
      parseFloat(s.balance),
    ] as [number, number]),
    [statements]
  )

  const statementHistory = useMemo(() =>
    statements.map((statement, index) => {
      const prev = statements[index - 1]
      const bal = parseFloat(statement.balance)
      const prevBal = prev ? parseFloat(prev.balance) : 0
      const change = bal - prevBal
      const percentChange = prevBal !== 0 ? (change / prevBal) * 100 : 0
      const date = statement.statement_closing_date ? new Date(statement.statement_closing_date) : null

      return {
        statement_id: statement.statement_id,
        statement_closing_date: statement.statement_closing_date,
        date,
        balance: bal,
        originalBalance: statement.balance,
        change,
        percentChange,
        lineItemCount: statement.lineItemCount,
        original: statement,
      }
    }),
    [statements]
  )

  const handleOpenModal = (statement: StatementSnapshot | null = null) => {
    setSelectedStatement(statement)
    if (statement) {
      setCurrentBalance(statement.balance)
      setCurrentDate(statement.statement_closing_date.split(' ')[0] ?? '')
    } else {
      setCurrentBalance('')
      setCurrentDate('')
    }
    setModalOpen(true)
  }

  const handleDeleteSnapshot = async (statement_closing_date: string, balance: string) => {
    try {
      await fetchWrapper.delete(`/api/finance/${accountId}/balance-timeseries`, { statement_closing_date, balance })
      onRefresh()
    } catch (error) {
      console.error('Error deleting balance snapshot:', error)
    }
  }

  const handleFormSubmit = async () => {
    if (!currentDate || !currentBalance || isSubmitting) return
    setIsSubmitting(true)
    const url = selectedStatement
      ? `/api/finance/balance-timeseries/${selectedStatement.statement_id}`
      : `/api/finance/${accountId}/balance-timeseries`
    const method = selectedStatement ? 'put' : 'post'

    try {
      await fetchWrapper[method](url, { balance: currentBalance, statement_closing_date: currentDate })
      onRefresh()
      setModalOpen(false)
    } catch (error) {
      console.error(`Error ${selectedStatement ? 'updating' : 'adding'} balance snapshot:`, error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDownloadCSV = useCallback(() => {
    const csvContent = 'Date,Balance\n' + statementHistory.map(row => `${row.date?.toISOString().split('T')[0] ?? ''},${row.balance}`).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${accountId}_statements.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [accountId, statementHistory])

  return (
    <TooltipProvider>
      <div className="flex justify-end gap-2 mb-2 px-8 items-center">
        <div className="flex items-center gap-2 mr-auto">
          <Switch
            id="chart-toggle"
            checked={showChart}
            onCheckedChange={(checked) => {
              setShowChart(checked)
              try {
                localStorage.setItem('finance_statements_chart_visible', String(checked))
              } catch { /* ignore */ }
            }}
          />
          <Label htmlFor="chart-toggle" className="text-sm cursor-pointer">Show Chart</Label>
        </div>
        <Button onClick={() => setIsAllStatementsModalOpen(true)} variant="outline" size="sm">
          <TableProperties className="h-4 w-4 mr-1" />
          View All Statements
        </Button>
        <Button onClick={handleDownloadCSV} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-1" />
          Download CSV
        </Button>
      </div>
      {showChart && <AccountStatementsChart balanceHistory={balanceHistory} />}
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
                  {row.date ? row.date.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  }) : '-'}
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
                        onClick={() => onViewDetail(row.statement_id)}
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
        {isAllStatementsModalOpen && (
          <AllStatementsModal
            accountId={accountId}
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
