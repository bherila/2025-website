import { useMemo, useState, useCallback, useEffect } from 'react'
import { ZodError, z } from 'zod'
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import TransactionsTable from '../TransactionsTable'
import { parseEtradeCsv } from '@/data/finance/parseEtradeCsv'
import { parseQuickenQFX } from '@/data/finance/parseQuickenQFX'
import { Button } from '@/components/ui/button'
import { splitDelimitedText } from '@/lib/splitDelimitedText'
import { parseWealthfrontHAR } from '@/data/finance/parseWealthfrontHAR'
import { parseFidelityCsv } from '@/data/finance/parseFidelityCsv'
import { parseDate } from '@/lib/DateHelper'
import { fetchWrapper } from '@/fetchWrapper'
import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { findDuplicateTransactions, filterOutDuplicates } from '@/data/finance/isDuplicateTransaction'
import { parseIbCsv, type IbStatementData } from '@/data/finance/parseIbCsv'
import currency from 'currency.js'

const CHUNK_SIZE = 100

/**
 * Format a number as currency
 */
function formatCurrency(value: number | null): string {
  if (value === null) return '—'
  return currency(value).format()
}

/**
 * Statement detail modal showing NAV, positions, performance, etc.
 */
function StatementDetailModal({ statement }: { statement: IbStatementData }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">View Details</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Statement Details</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="nav" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="nav">NAV</TabsTrigger>
            <TabsTrigger value="positions">Positions</TabsTrigger>
            <TabsTrigger value="cash">Cash Report</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>
          
          <TabsContent value="nav" className="mt-4">
            <h3 className="font-semibold mb-2">Net Asset Value</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Asset Class</th>
                  <th className="text-right p-2">Prior Total</th>
                  <th className="text-right p-2">Current Total</th>
                  <th className="text-right p-2">Change</th>
                </tr>
              </thead>
              <tbody>
                {statement.nav.map((row, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{row.assetClass}</td>
                    <td className="text-right p-2">{formatCurrency(row.priorTotal)}</td>
                    <td className="text-right p-2">{formatCurrency(row.currentTotal)}</td>
                    <td className={`text-right p-2 ${(row.changeAmount ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(row.changeAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabsContent>
          
          <TabsContent value="positions" className="mt-4">
            <h3 className="font-semibold mb-2">Open Positions ({statement.positions.length})</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Symbol</th>
                  <th className="text-right p-2">Qty</th>
                  <th className="text-right p-2">Cost Basis</th>
                  <th className="text-right p-2">Market Value</th>
                  <th className="text-right p-2">Unrealized P/L</th>
                </tr>
              </thead>
              <tbody>
                {statement.positions.map((row, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">
                      {row.symbol}
                      {row.optType && <span className="text-xs text-gray-500 ml-1">({row.optType})</span>}
                    </td>
                    <td className="text-right p-2">{row.quantity}</td>
                    <td className="text-right p-2">{formatCurrency(row.costBasis)}</td>
                    <td className="text-right p-2">{formatCurrency(row.marketValue)}</td>
                    <td className={`text-right p-2 ${(row.unrealizedPl ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(row.unrealizedPl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabsContent>
          
          <TabsContent value="cash" className="mt-4">
            <h3 className="font-semibold mb-2">Cash Report</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Line Item</th>
                  <th className="text-left p-2">Currency</th>
                  <th className="text-right p-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {statement.cashReport.map((row, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{row.lineItem}</td>
                    <td className="p-2">{row.currency}</td>
                    <td className="text-right p-2">{formatCurrency(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabsContent>
          
          <TabsContent value="performance" className="mt-4">
            <h3 className="font-semibold mb-2">Performance Summary</h3>
            <div className="space-y-4">
              {/* MTM Performance */}
              <div>
                <h4 className="font-medium text-sm mb-2">Mark-to-Market</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Symbol</th>
                      <th className="text-right p-2">P/L Position</th>
                      <th className="text-right p-2">P/L Transaction</th>
                      <th className="text-right p-2">Total P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.performance
                      .filter(row => row.perfType === 'mtm')
                      .map((row, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-2">{row.symbol}</td>
                          <td className={`text-right p-2 ${(row.mtmPlPosition ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(row.mtmPlPosition)}
                          </td>
                          <td className={`text-right p-2 ${(row.mtmPlTransaction ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(row.mtmPlTransaction)}
                          </td>
                          <td className={`text-right p-2 ${(row.mtmPlTotal ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(row.mtmPlTotal)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              
              {/* Realized/Unrealized */}
              <div>
                <h4 className="font-medium text-sm mb-2">Realized & Unrealized</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Symbol</th>
                      <th className="text-right p-2">Realized</th>
                      <th className="text-right p-2">Unrealized</th>
                      <th className="text-right p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.performance
                      .filter(row => row.perfType === 'realized_unrealized')
                      .map((row, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-2">{row.symbol}</td>
                          <td className={`text-right p-2 ${(row.realizedTotal ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(row.realizedTotal)}
                          </td>
                          <td className={`text-right p-2 ${(row.unrealizedTotal ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(row.unrealizedTotal)}
                          </td>
                          <td className={`text-right p-2 ${(row.totalPl ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(row.totalPl)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Statement preview card showing summary info
 */
function StatementPreviewCard({ statement }: { statement: IbStatementData }) {
  return (
    <div className="border rounded-lg p-4 mb-4 bg-blue-50 dark:bg-blue-900/20">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">Statement Available</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {statement.info.brokerName} • {statement.info.period}
          </p>
          {statement.info.accountName && (
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Account: {statement.info.accountName} ({statement.info.accountNumber})
            </p>
          )}
        </div>
        <div className="text-right">
          {statement.totalNav !== null && (
            <p className="text-lg font-semibold">
              NAV: {formatCurrency(statement.totalNav)}
            </p>
          )}
          <p className="text-sm text-gray-500">
            {statement.positions.length} positions • {statement.performance.length} performance records
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <StatementDetailModal statement={statement} />
        <span className="text-sm text-gray-500">
          This statement data will be imported alongside the transactions.
        </span>
      </div>
    </div>
  )
}

function ImportProgressDialog({
  open,
  progress,
  error,
  onRetry,
  onCancel,
}: {
  open: boolean
  progress: { processed: number; total: number }
  error: string | null
  onRetry: () => void
  onCancel: () => void
}) {
  const percentage = progress.total > 0 ? (progress.processed / progress.total) * 100 : 0

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{error ? 'Import Failed' : 'Importing Transactions'}</AlertDialogTitle>
          <AlertDialogDescription>
            {error ? (
              <div className="text-red-500">{error}</div>
            ) : (
              `Please wait while the transactions are being imported. Do not close this window.`
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!error && (
          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
            <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
            <p className="text-sm text-center mt-2">
              {progress.processed} of {progress.total} transactions imported.
            </p>
          </div>
        )}
        {error && (
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRetry}>Retry</AlertDialogAction>
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default function ImportTransactions({ 
  accountId, 
  onImportFinished,
  onStatementParsed,
}: { 
  accountId: number
  onImportFinished: () => void
  onStatementParsed?: (statement: IbStatementData | null) => void
}) {
  const [text, setText] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ processed: 0, total: 0 })
  const [importError, setImportError] = useState<string | null>(null)
  const [dataToImport, setDataToImport] = useState<AccountLineItem[]>([])
  const [currentDuplicates, setCurrentDuplicates] = useState<AccountLineItem[]>([])
  const [existingTransactions, setExistingTransactions] = useState<AccountLineItem[]>([])
  const [loadingExisting, setLoadingExisting] = useState(true)

  // Load all existing transactions upfront
  useEffect(() => {
    const loadExistingTransactions = async () => {
      try {
        setLoadingExisting(true)
        const transactions = await fetchWrapper.get(`/api/finance/${accountId}/line_items`)
        setExistingTransactions(transactions)
      } catch (e) {
        console.error('Failed to load existing transactions:', e)
      } finally {
        setLoadingExisting(false)
      }
    }
    loadExistingTransactions()
  }, [accountId])

  const processChunks = useCallback(async (chunks: AccountLineItem[][], chunkIndex: number) => {
    if (chunkIndex >= chunks.length) {
      setIsImporting(false)
      window.location.href = `/finance/${accountId}`
      return
    }

    const chunk = chunks[chunkIndex]
    if (!chunk) {
      // Should not happen if logic is correct, but satisfies TypeScript
      setIsImporting(false)
      window.location.href = `/finance/${accountId}`
      return
    }

    try {
      await fetchWrapper.post(`/api/finance/${accountId}/line_items`, chunk)
      setImportProgress((prev) => ({ ...prev, processed: prev.processed + chunk.length }))
      await processChunks(chunks, chunkIndex + 1)
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      setImportError(`Failed to import chunk ${chunkIndex + 1}: ${errorMessage}`)
    }
  }, [accountId])

  const handleImport = useCallback(async (data: AccountLineItem[], statementToImport: IbStatementData | null) => {
    z.array(AccountLineItemSchema).parse(data)
    setLoading(true)
    setIsImporting(true)
    setImportError(null)
    
    // Import statement first (if available)
    if (statementToImport) {
      try {
        await fetchWrapper.post(`/api/finance/${accountId}/import-ib-statement`, {
          statement: statementToImport,
        })
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        setImportError(`Failed to import statement: ${errorMessage}`)
        setIsImporting(false)
        setLoading(false)
        return
      }
    }
    
    // Use the preloaded existing transactions to filter out duplicates
    const newTransactions = filterOutDuplicates(data, existingTransactions)
    
    setLoading(false)

    if (newTransactions.length > 0) {
      setDataToImport(newTransactions)
      setImportProgress({ processed: 0, total: newTransactions.length })
      const chunks = []
      for (let i = 0; i < newTransactions.length; i += CHUNK_SIZE) {
        chunks.push(newTransactions.slice(i, i + CHUNK_SIZE))
      }
      await processChunks(chunks, 0)
    } else {
      setIsImporting(false)
      onImportFinished()
    }
  }, [accountId, existingTransactions, processChunks, onImportFinished])


  const handleTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value)
  }

  const handleFileRead = useCallback(async (file: File) => {
    try {
      if (file.type === 'application/pdf') {
        setLoading(true)
        const formData = new FormData()
        formData.append('file', file)
        try {
          const response = await fetchWrapper.post('/api/finance/transactions/import-gemini', formData)
          setText(response.trimStart())
        } catch (e) {
          setError(`Error processing PDF: ${e instanceof Error ? e.message : String(e)}`)
        } finally {
          setLoading(false)
        }
      } else {
        const text = await file.text()
        setText(text.trimStart())
      }
      setError(null)
    } catch (err) {
      setError(`Error reading file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragOver(false)
      const files = event.dataTransfer?.files
      if (files && files.length > 0) {
        handleFileRead(files[0]!)
      }
    },
    [handleFileRead],
  )

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)
  }, [])

  const { data, statement, parseError } = useMemo((): { 
    data: AccountLineItem[] | null
    statement: IbStatementData | null
    parseError: string | null 
  } => {
    if (!text.trim()) {
      return { data: null, statement: null, parseError: null }
    }
    return parseData(text)
  }, [text])

  // Notify parent when statement data is parsed
  useEffect(() => {
    onStatementParsed?.(statement)
  }, [statement, onStatementParsed])

  // Flag duplicates as soon as the file is parsed
  useEffect(() => {
    if (data && data.length > 0 && existingTransactions.length > 0) {
      const duplicates = findDuplicateTransactions(data, existingTransactions)
      setCurrentDuplicates(duplicates)
    } else {
      setCurrentDuplicates([])
    }
  }, [data, existingTransactions])

  const retryImport = () => {
    setImportError(null);
    const chunks = []
    for (let i = 0; i < dataToImport.length; i += CHUNK_SIZE) {
      chunks.push(dataToImport.slice(i, i + CHUNK_SIZE))
    }
    const failedChunkIndex = Math.floor(importProgress.processed / CHUNK_SIZE)
    processChunks(chunks, failedChunkIndex)
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`border-2 p-5 text-center transition-colors ${isDragOver ? 'border-blue-500' : 'border-gray-300'}`}
    >
      <ImportProgressDialog
        open={isImporting}
        progress={importProgress}
        error={importError}
        onRetry={retryImport}
        onCancel={() => setIsImporting(false)}
      />

      {error && <div className="text-red-500">{error}</div>}
      {parseError && <div className="text-red-500">{parseError}</div>}

      {loading ? (
        <div className="flex justify-center items-center h-40">
          <Spinner />
          <p className="ml-2">Processing...</p>
        </div>
      ) : (
        <textarea
          value={text}
          onChange={handleTextareaChange}
          placeholder="Paste CSV, QFX, or HAR data here, or drag and drop a file."
          rows={5}
          className="w-full"
        />
      )}

      {currentDuplicates.length > 0 && (
        <div className="my-2 text-red-500">
          <p>{currentDuplicates.length} duplicate transactions were found and will not be imported. They are highlighted in the table below.</p>
        </div>
      )}

      {/* Statement preview card */}
      {statement && <StatementPreviewCard statement={statement} />}

      {data && data.length > 0 && (
        <div style={{textAlign: 'left'}}>
          <div className="my-2">
            <Button
              className="mx-1"
              onClick={(e) => {
                e.preventDefault()
                if (data) {
                  handleImport(data, statement)
                }
              }}
              disabled={loading || isImporting}
            >
              Import {data.length} Transaction{data.length !== 1 ? 's' : ''}{statement ? ' + Statement' : ''}
            </Button>
            <Button className="mx-1" onClick={() => setText('')} disabled={loading || isImporting}>
              Clear
            </Button>
          </div>
          <TransactionsTable data={data} duplicates={currentDuplicates} />
        </div>
      )}
    </div>
  )
}

function parseData(text: string): { 
  data: AccountLineItem[] | null
  statement: IbStatementData | null
  parseError: string | null 
} {
  // Try parsing as ETrade CSV
  const eTradeData = parseEtradeCsv(text)
  if (eTradeData.length > 0) {
    return { data: eTradeData, statement: null, parseError: null }
  }

  // Try parsing as QFX
  const qfxData = parseQuickenQFX(text)
  if (qfxData.length > 0) {
    return { data: qfxData, statement: null, parseError: null }
  }

  // Try parsing as Wealthfront HAR
  const wealthfrontData = parseWealthfrontHAR(text)
  if (wealthfrontData.length > 0) {
    return { data: wealthfrontData, statement: null, parseError: null }
  }

  // Try parsing as Fidelity
  const fidelityData = parseFidelityCsv(text)
  if (fidelityData.length > 0) {
    return { data: fidelityData, statement: null, parseError: null }
  }

  // Try parsing as IB (includes statement data)
  const ibResult = parseIbCsv(text)
  if (ibResult.trades.length > 0 || ibResult.statement.positions.length > 0) {
    // Combine trades, interest, and fees into one array
    const allTransactions = [
      ...ibResult.trades,
      ...ibResult.interest,
      ...ibResult.fees,
    ]
    // Check if we have meaningful statement data
    const hasStatementData = ibResult.statement.positions.length > 0 || 
      ibResult.statement.nav.length > 0 || 
      ibResult.statement.performance.length > 0
    return { 
      data: allTransactions.length > 0 ? allTransactions : null, 
      statement: hasStatementData ? ibResult.statement : null, 
      parseError: null 
    }
  }

  const data: AccountLineItem[] = []
  let parseError: string | null = null
  try {
    const lines = splitDelimitedText(text)
    if (lines.length > 1 && lines[0]) {
      const getColumnIndex = (...headers: string[]) => {
        const firstLine = lines[0]!.map((cell) => cell.trim())
        const index = firstLine.findIndex(h => headers.includes(h))
        return index !== -1 ? index : null
      }

      const dateColIndex = getColumnIndex('Date', 'Transaction Date', 'date')
      const postDateColIndex = getColumnIndex('Post Date', 'As of', 'As of Date', 'Settlement Date', 'Date Settled', 'Settled')
      const descriptionColIndex = getColumnIndex('Description', 'Desc', 'description')
      const amountColIndex = getColumnIndex('Amount', 'Amt', 'amount')
      const commentColIndex = getColumnIndex('Comment', 'Memo', 'memo')
      const typeColIndex = getColumnIndex('Type', 'type')
      const categoryColIndex = getColumnIndex('Category')
      const accountBalanceColIndex = getColumnIndex('Cash Balance ($)')

      if (dateColIndex !== null && descriptionColIndex !== null && amountColIndex !== null) {
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i]
          if (row && row[dateColIndex]) {
            data.push(
              AccountLineItemSchema.parse({
                t_date: parseDate(row[dateColIndex]!)?.formatYMD() ?? row[dateColIndex]!,
                t_date_posted: postDateColIndex !== null && row[postDateColIndex] ? parseDate(row[postDateColIndex]!)?.formatYMD() : undefined,
                t_description: row[descriptionColIndex]!,
                t_amt: row[amountColIndex]!,
                t_account_balance: accountBalanceColIndex !== null ? row[accountBalanceColIndex] : undefined,
                t_comment: commentColIndex !== null ? row[commentColIndex] : undefined,
                t_type: typeColIndex !== null ? row[typeColIndex] : undefined,
                t_schc_category: categoryColIndex !== null ? row[categoryColIndex] : undefined,
              }),
            )
          }
        }
      }
    }
  } catch (e) {
    parseError = e instanceof ZodError ? e.message : (e as Error).toString()
  }
  return { data: data.length > 0 ? data : null, statement: null, parseError }
}
