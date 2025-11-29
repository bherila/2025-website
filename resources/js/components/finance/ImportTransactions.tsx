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
import { findDuplicateTransactions, filterOutDuplicates } from '@/data/finance/isDuplicateTransaction'

const CHUNK_SIZE = 100

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

export default function ImportTransactions({ accountId, onImportFinished }: { accountId: number, onImportFinished: () => void }) {
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

  const handleImport = useCallback(async (data: AccountLineItem[]) => {
    z.array(AccountLineItemSchema).parse(data)
    setLoading(true)
    setIsImporting(true)
    setImportError(null)
    
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
  }, [existingTransactions, processChunks, onImportFinished])


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

  const { data, parseError } = useMemo((): { data: AccountLineItem[] | null; parseError: string | null } => {
    if (!text.trim()) {
      return { data: null, parseError: null }
    }
    return parseData(text)
  }, [text])

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

      {data && data.length > 0 && (
        <>
          <div className="my-2">
            <Button
              className="mx-1"
              onClick={(e) => {
                e.preventDefault()
                if (data) {
                  handleImport(data)
                }
              }}
              disabled={loading || isImporting}
            >
              Import {data.length}
            </Button>
            <Button className="mx-1" onClick={() => setText('')} disabled={loading || isImporting}>
              Clear
            </Button>
          </div>
          <TransactionsTable data={data} duplicates={currentDuplicates} />
        </>
      )}
    </div>
  )
}

function parseData(text: string): { data: AccountLineItem[] | null; parseError: string | null } {
  // Try parsing as ETrade CSV
  const eTradeData = parseEtradeCsv(text)
  if (eTradeData.length > 0) {
    return { data: eTradeData, parseError: null }
  }

  // Try parsing as QFX
  const qfxData = parseQuickenQFX(text)
  if (qfxData.length > 0) {
    return { data: qfxData, parseError: null }
  }

  // Try parsing as Wealthfront HAR
  const wealthfrontData = parseWealthfrontHAR(text)
  if (wealthfrontData.length > 0) {
    return { data: wealthfrontData, parseError: null }
  }

  // Try parsing as Fidelity
  const fidelityData = parseFidelityCsv(text)
  if (fidelityData.length > 0) {
    return { data: fidelityData, parseError: null }
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
  return { data: data.length > 0 ? data : null, parseError }
}
