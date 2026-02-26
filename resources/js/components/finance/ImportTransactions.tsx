import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { filterOutDuplicates, findDuplicateTransactions } from '@/data/finance/isDuplicateTransaction'
import type { IbStatementData } from '@/data/finance/parseIbCsv'
import { parseImportData } from '@/data/finance/parseImportData'
import { fetchWrapper } from '@/fetchWrapper'

import { ImportProgressDialog } from './ImportProgressDialog'
import { PdfStatementPreviewCard } from './PdfStatementPreviewCard'
import { StatementPreviewCard } from './StatementPreviewCard'
import TransactionsTable from './TransactionsTable'

const CHUNK_SIZE = 100

/** Response structure from the Gemini PDF import endpoint */
interface GeminiImportResponse {
  statementInfo?: {
    brokerName?: string
    accountNumber?: string
    accountName?: string
    periodStart?: string
    periodEnd?: string
    closingBalance?: number
  }
  statementDetails?: Array<{
    section: string
    line_item: string
    statement_period_value: number
    ytd_value: number
    is_percentage: boolean
  }>
  transactions?: Array<{
    date: string
    description: string
    amount: number
    type?: string
  }>
  error?: string
}

/** Information about the dropped/pasted file */
interface FileInfo {
  name: string
  type: string
  size: number
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
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
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
  const [pdfData, setPdfData] = useState<GeminiImportResponse | null>(null)
  // Pending PDF file waiting for user to click "Process with AI"
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null)
  // Gemini-specific error for retry
  const [geminiError, setGeminiError] = useState<string | null>(null)
  // Checkboxes for PDF import options — persisted in localStorage
  const [importTransactions, setImportTransactions] = useState(() => {
    try { const v = localStorage.getItem('pdf_import_transactions'); return v === null ? true : v === 'true' } catch { return true }
  })
  const [attachAsStatement, setAttachAsStatement] = useState(() => {
    try { const v = localStorage.getItem('pdf_attach_statement'); return v === null ? true : v === 'true' } catch { return true }
  })
  const [saveFileToS3, setSaveFileToS3] = useState(() => {
    try { const v = localStorage.getItem('pdf_save_file_s3'); return v === null ? true : v === 'true' } catch { return true }
  })
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    if (data.length > 0) {
      z.array(AccountLineItemSchema).parse(data)
    }
    setLoading(true)
    setIsImporting(true)
    setImportError(null)
    
    // Import IB statement first (if available)
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
    
    // Import PDF statement details (if available)
    if (pdfData?.statementDetails && pdfData.statementDetails.length > 0) {
      try {
        await fetchWrapper.post(`/api/finance/${accountId}/import-pdf-statement`, {
          statementInfo: pdfData.statementInfo,
          statementDetails: pdfData.statementDetails,
        })
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        setImportError(`Failed to import statement details: ${errorMessage}`)
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
  }, [accountId, existingTransactions, processChunks, onImportFinished, pdfData])

  const clearData = useCallback(() => {
    setText('')
    setFileInfo(null)
    setPdfData(null)
    setPendingPdfFile(null)
    setGeminiError(null)
    setError(null)
  }, [])

  /** Accept a file but do NOT auto-submit PDFs to Gemini */
  const handleFileRead = useCallback(async (file: File) => {
    setFileInfo({
      name: file.name,
      type: file.type || 'unknown',
      size: file.size,
    })
    setError(null)
    setGeminiError(null)
    setPdfData(null)
    setPendingPdfFile(null)
    setText('')
    
    try {
      if (file.type === 'application/pdf') {
        // Store file for later — user must click "Process with AI"
        setPendingPdfFile(file)
      } else {
        const content = await file.text()
        setText(content.trimStart())
      }
    } catch (err) {
      setError(`Error reading file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  /** Send the pending PDF to Gemini for AI processing */
  const processPdfWithGemini = useCallback(async () => {
    if (!pendingPdfFile) return
    setLoading(true)
    setGeminiError(null)
    setError(null)
    const formData = new FormData()
    formData.append('file', pendingPdfFile)
    formData.append('import_transactions', importTransactions ? '1' : '0')
    formData.append('attach_as_statement', attachAsStatement ? '1' : '0')
    try {
      const response = await fetchWrapper.post('/api/finance/transactions/import-gemini', formData) as GeminiImportResponse
      if (response.error) {
        setGeminiError(response.error)
      } else {
        setPdfData(response)
        // Upload file to S3 if the checkbox is checked
        if (saveFileToS3) {
          try {
            const uploadForm = new FormData()
            uploadForm.append('file', pendingPdfFile)
            await fetchWrapper.post(`/api/finance/${accountId}/files`, uploadForm)
          } catch (uploadErr) {
            console.error('Failed to save file to S3:', uploadErr)
          }
        }
        setPendingPdfFile(null)
      }
    } catch (e) {
      setGeminiError(`Error processing PDF: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [pendingPdfFile, importTransactions, attachAsStatement, saveFileToS3, accountId])

  /** Handle click-to-select file via hidden input */
  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files.length > 0) {
      handleFileRead(files[0]!)
    }
    // Reset so the same file can be re-selected
    event.target.value = ''
  }, [handleFileRead])

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
    return parseImportData(text)
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

  // Handle Ctrl+V paste on the page
  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    // Check if there are files in the clipboard
    const items = event.clipboardData?.items
    if (items) {
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) {
            event.preventDefault()
            handleFileRead(file)
            return
          }
        }
      }
      // If no files, check for text
      const textData = event.clipboardData?.getData('text/plain')
      if (textData) {
        event.preventDefault()
        setFileInfo({ name: 'Pasted text', type: 'text/plain', size: textData.length })
        setPdfData(null)
        setText(textData.trimStart())
      }
    }
  }, [handleFileRead])

  // Add paste event listener
  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => {
      document.removeEventListener('paste', handlePaste)
    }
  }, [handlePaste])

  // Parse PDF data to AccountLineItem format
  const pdfParsedData = useMemo((): AccountLineItem[] | null => {
    if (!pdfData?.transactions || pdfData.transactions.length === 0) {
      return null
    }
    return pdfData.transactions.map(tx => {
      // ensure date string has only YYYY-MM-DD
      const dateStr = tx.date ? tx.date.split(/[ T]/)[0] : ''
      return AccountLineItemSchema.parse({
        t_date: dateStr,
        t_description: tx.description,
        t_amt: tx.amount,
        t_type: tx.type,
      })
    })
  }, [pdfData])

  // Helper to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Combine data from text parsing or PDF parsing
  const effectiveData = data ?? pdfParsedData
  
  // Check if we have statement details from PDF
  const hasStatementDetails = (pdfData?.statementDetails?.length ?? 0) > 0
  const transactionCount = effectiveData?.length ?? 0
  
  // Build import button text
  const getImportButtonText = () => {
    const parts: string[] = []
    if (transactionCount > 0) {
      parts.push(`${transactionCount} Transaction${transactionCount !== 1 ? 's' : ''}`)
    }
    if (statement) {
      parts.push('1 Statement')
    } else if (hasStatementDetails) {
      parts.push('1 Statement')
    }
    if (parts.length === 0) return 'Import'
    return `Import ${parts.join(' and ')}`
  }

  return (
    <div
      ref={dropZoneRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`border-2 p-5 text-center transition-colors ${isDragOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : 'border-gray-300 dark:border-gray-600'}`}
    >
      {/* Hidden file input for click-to-select */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.qfx,.ofx,.har,.pdf,.txt"
        className="hidden"
        onChange={handleFileInputChange}
        data-testid="file-input"
      />

      <ImportProgressDialog
        open={isImporting}
        progress={importProgress}
        error={importError}
        onRetry={retryImport}
        onCancel={() => setIsImporting(false)}
      />

      {error && <div className="text-red-500 mb-2">{error}</div>}
      {parseError && <div className="text-red-500 mb-2">{parseError}</div>}

      {loading ? (
        <div className="flex justify-center items-center h-40">
          <Spinner />
          <p className="ml-2">Processing with AI...</p>
        </div>
      ) : fileInfo ? (
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="text-3xl">
              {fileInfo.type === 'application/pdf' ? '📄' : 
               fileInfo.type.includes('csv') || fileInfo.name.endsWith('.csv') ? '📊' :
               fileInfo.name.endsWith('.qfx') || fileInfo.name.endsWith('.ofx') ? '🏦' :
               '📋'}
            </div>
            <div className="text-left">
              <div className="font-medium">{fileInfo.name}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {formatFileSize(fileInfo.size)} • {fileInfo.type || 'Unknown type'}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={clearData}>
            ✕
          </Button>
        </div>
      ) : (
        <div className="h-32 flex flex-col justify-center items-center text-gray-500 dark:text-gray-400">
          <p className="mb-2">Drop a file here, paste with Ctrl+V, or</p>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            Choose File
          </Button>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Supports CSV, QFX, HAR, and PDF files</p>
        </div>
      )}

      {/* Gemini error with retry */}
      {geminiError && (
        <div className="my-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-left">
          <p className="text-red-600 dark:text-red-400 mb-2">{geminiError}</p>
          <Button variant="outline" size="sm" onClick={processPdfWithGemini}>
            Retry
          </Button>
        </div>
      )}

      {/* PDF pending: show "Process with AI" button */}
      {pendingPdfFile && !loading && !pdfData && !geminiError && (
        <div className="my-3">
          <div className="flex items-center gap-4 mb-3 justify-center">
            <div className="flex items-center gap-2">
              <Checkbox
                id="import-transactions"
                checked={importTransactions}
                onCheckedChange={(checked) => {
                  const val = checked === true
                  setImportTransactions(val)
                  try { localStorage.setItem('pdf_import_transactions', String(val)) } catch { /* ignore */ }
                }}
              />
              <Label htmlFor="import-transactions">Import Transactions</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="attach-statement"
                checked={attachAsStatement}
                onCheckedChange={(checked) => {
                  const val = checked === true
                  setAttachAsStatement(val)
                  try { localStorage.setItem('pdf_attach_statement', String(val)) } catch { /* ignore */ }
                }}
              />
              <Label htmlFor="attach-statement">Attach as Statement</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="save-file-s3"
                checked={saveFileToS3}
                onCheckedChange={(checked) => {
                  const val = checked === true
                  setSaveFileToS3(val)
                  try { localStorage.setItem('pdf_save_file_s3', String(val)) } catch { /* ignore */ }
                }}
              />
              <Label htmlFor="save-file-s3">Save File to Storage</Label>
            </div>
          </div>
          <Button onClick={processPdfWithGemini} disabled={!importTransactions && !attachAsStatement && !saveFileToS3}>
            Process with AI
          </Button>
        </div>
      )}

      {/* PDF statement preview card */}
      {hasStatementDetails && pdfData?.statementDetails && (
        <PdfStatementPreviewCard 
          statementInfo={pdfData.statementInfo} 
          statementDetails={pdfData.statementDetails} 
        />
      )}

      {currentDuplicates.length > 0 && (
        <div className="my-2 text-red-500">
          <p>{currentDuplicates.length} duplicate transactions were found and will not be imported. They are highlighted in the table below.</p>
        </div>
      )}

      {/* Statement preview card */}
      {statement && <StatementPreviewCard statement={statement} />}

      {/* Show import button if we have data or statement details */}
      {(effectiveData && effectiveData.length > 0) || hasStatementDetails ? (
        <div style={{textAlign: 'left'}}>
          <div className="my-2">
            <Button
              className="mx-1"
              onClick={(e) => {
                e.preventDefault()
                handleImport(effectiveData ?? [], statement)
              }}
              disabled={loading || isImporting}
            >
              {getImportButtonText()}
            </Button>
            <Button className="mx-1" onClick={clearData} disabled={loading || isImporting}>
              Clear
            </Button>
          </div>
          {effectiveData && effectiveData.length > 0 && (
            <TransactionsTable data={effectiveData} duplicates={currentDuplicates} />
          )}
        </div>
      ) : null}

      {/* Show clear button if we have file info but no valid data and not a pending PDF */}
      {fileInfo && !effectiveData && !loading && !pendingPdfFile && (
        <div className="mt-4">
          <Button variant="outline" onClick={clearData}>
            Clear and try another file
          </Button>
        </div>
      )}
    </div>
  )
}
