import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import type { IbStatementData } from '@/data/finance/parseIbCsv'
import { useGenAiFileUpload } from '@/genai-processor/useGenAiFileUpload'
import { useGenAiJobPolling } from '@/genai-processor/useGenAiJobPolling'
import type { AccountForMatching } from '@/lib/finance/accountMatcher'
import { getAccountSuffix } from '@/lib/finance/accountMatcher'

import { useFinanceAccounts } from '../AccountNavigation'
import TransactionsTable from '../TransactionsTable'
import GenAiJobsList from './GenAiJobsList'
import { ImportProgressDialog } from './ImportProgressDialog'
import type { GeminiImportResponse } from './importTypes'
import { normalizeGeminiImportResponse } from './importTypes'
import { PdfStatementPreviewCard } from './PdfStatementPreviewCard'
import { StatementPreviewCard } from './StatementPreviewCard'
import { useDuplicateDetection } from './useDuplicateDetection'
import { useImportExecution } from './useImportExecution'
import { useImportSummary } from './useImportSummary'
import { useImportTransactionDragDrop } from './useImportTransactionDragDrop'
import { useImportTransactionPaste } from './useImportTransactionPaste'
import { usePdfAccountMapping } from './usePdfAccountMapping'
import { usePdfImportOptions } from './usePdfImportOptions'

/** Information about the dropped/pasted file */
interface FileInfo {
  name: string
  type: string
  size: number
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ImportTransactions({
  accountId,
  onImportFinished,
  onStatementParsed,
}: {
  accountId: number | 'all'
  onImportFinished: () => void
  onStatementParsed?: (statement: IbStatementData | null) => void
}) {
  const [text, setText] = useState<string>('')
  const [data, setData] = useState<AccountLineItem[] | null>(null)
  const [statement, setStatement] = useState<IbStatementData | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pdfData, setPdfData] = useState<GeminiImportResponse | null>(null)
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null)

  // GenAI queue state
  const [jobId, setJobId] = useState<number | null>(null)
  const [queueUploadError, setQueueUploadError] = useState<string | null>(null)

  const dropZoneRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Notify parent when statement changes
  useEffect(() => {
    onStatementParsed?.(statement)
  }, [statement, onStatementParsed])

  // Fetch all user accounts (including acct_number for suffix matching)
  const { accounts: allAccounts } = useFinanceAccounts()

  // Adapt accounts for the matcher utility
  const accountsForMatching = useMemo(
    (): AccountForMatching[] =>
      allAccounts.map((a) => ({
        acct_id: a.acct_id,
        acct_name: a.acct_name,
        acct_number: (a as { acct_number?: string | null }).acct_number ?? null,
      })),
    [allAccounts],
  )

  // Hooks
  const { filterDuplicates } = useDuplicateDetection({ accountId })

  const {
    importTransactions,
    setImportTransactions,
    attachAsStatement,
    setAttachAsStatement,
  } = usePdfImportOptions()

  const { pdfAccountBlocks, pdfParsedData, accountMappings, setAccountMappings } = usePdfAccountMapping({
    pdfData,
    accountsForMatching,
  })

  const { isImporting, setIsImporting, importProgress, importError, handleImport, retryImport } = useImportExecution({
    accountId,
    filterDuplicates,
    onImportFinished,
    pdfData,
    pdfAccountBlocks,
    accountMappings,
    importTransactions,
    attachAsStatement,
  })

  const {
    effectiveData,
    hasStatementDetails,
    hasLots,
    transactionCount,
    multiAccountTransactionCount,
    importButtonText,
    hasImportableContent,
  } = useImportSummary({
    data,
    pdfParsedData,
    pdfAccountBlocks,
    statement,
    importTransactions,
    attachAsStatement,
  })

  // Build accounts context for the AI prompt (name + last4 only — never full numbers)
  const accountsContext = useMemo(
    () =>
      accountsForMatching
        .filter((a) => a.acct_number)
        .map((a) => ({
          name: a.acct_name,
          last4: getAccountSuffix(a.acct_number!, 4),
        })),
    [accountsForMatching],
  )

  // Memoize context object to avoid recreating the upload callback on every render
  const uploadContext = useMemo(
    () => (accountsContext.length > 0 ? { accounts: accountsContext } : undefined),
    [accountsContext],
  )

  // GenAI queue upload hook
  const { upload: uploadToQueue, uploading: queueUploading, error: uploadHookError } = useGenAiFileUpload({
    jobType: 'finance_transactions',
    ...(typeof accountId === 'number' ? { acctId: accountId } : {}),
    ...(uploadContext ? { context: uploadContext } : {}),
  })

  // GenAI job polling hook
  const { status: jobStatus, results: jobResults, error: jobPollingError, estimatedWait } = useGenAiJobPolling(jobId)

  // When the job finishes parsing (or has been imported), extract the result and set pdfData
  useEffect(() => {
    if (jobId && jobResults.length > 0 && (jobStatus === 'parsed' || jobStatus === 'imported')) {
      const firstResult = jobResults[0]
      if (!firstResult?.result_json) {
        setError('AI result is empty. Please try again.')
        return
      }
      try {
        const parsed = normalizeGeminiImportResponse(JSON.parse(firstResult.result_json))
        if (!parsed) {
          throw new Error('Invalid AI result shape')
        }
        setPdfData(parsed)
      } catch {
        setError('Failed to parse AI result. Please try again.')
      }
    }
  }, [jobId, jobStatus, jobResults])

  const clearData = useCallback(() => {
    setText('')
    setData(null)
    setStatement(null)
    setParseError(null)
    setFileInfo(null)
    setPdfData(null)
    setPendingPdfFile(null)
    setQueueUploadError(null)
    setError(null)
    setJobId(null)
    setAccountMappings([])
  }, [setAccountMappings])

  /** Accept a file but do NOT auto-submit PDFs */
  const handleFileRead = useCallback(async (file: File) => {
    setFileInfo({
      name: file.name,
      type: file.type || 'unknown',
      size: file.size,
    })
    setError(null)
    setQueueUploadError(null)
    setPdfData(null)
    setPendingPdfFile(null)
    setJobId(null)
    setText('')

    try {
      if (file.type === 'application/pdf') {
        setPendingPdfFile(file)
      } else {
        const content = await file.text()
        setText(content.trimStart())
      }
    } catch (err) {
      setError(`Error reading file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  /** Drag-and-drop and file input handlers */
  const { isDragOver, handleFileInputChange, handleDrop, handleDragOver, handleDragLeave } =
    useImportTransactionDragDrop({ onFileReceived: handleFileRead })

  /** Paste handler (Ctrl+V) and text parsing */
  const handleParsedData = useCallback(
    (parsed: { data: AccountLineItem[] | null; statement: IbStatementData | null; parseError: string | null }) => {
      setData(parsed.data)
      setStatement(parsed.statement)
      setParseError(parsed.parseError)
    },
    [],
  )

  const { parseTextData } = useImportTransactionPaste({
    onFileReceived: handleFileRead,
    onTextReceived: setText,
    onParsedData: handleParsedData,
    setPdfData,
    setFileInfo,
  })

  // Parse text when it changes
  useEffect(() => {
    parseTextData(text)
  }, [text, parseTextData])

  /** Upload the pending PDF to the GenAI queue for async processing */
  const processWithQueue = useCallback(async () => {
    if (!pendingPdfFile) return
    setQueueUploadError(null)
    setLoading(true)
    try {
      const result = await uploadToQueue(pendingPdfFile)
      setJobId(result.jobId)
      setPendingPdfFile(null)
    } catch (err) {
      setQueueUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
  }, [pendingPdfFile, uploadToQueue])

  // Determine job state
  const isJobActive = jobStatus === 'pending' || jobStatus === 'processing'
  const isJobFailed = jobStatus === 'failed'
  const isJobDeferred = jobStatus === 'queued_tomorrow'
  const isJobParsed = jobStatus === 'parsed'

  const activeQueueError = queueUploadError ?? uploadHookError ?? jobPollingError

  const handleSelectJob = useCallback((selectedJobId: number) => {
    // Clear previous job results and errors so the UI reflects the newly selected job
    setPdfData(null)
    setError(null)
    setQueueUploadError(null)
    setJobId(selectedJobId)
  }, [])

  return (
    <>
      <GenAiJobsList accountId={accountId} onSelectJob={handleSelectJob} />
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

      {loading || queueUploading ? (
        <div className="flex justify-center items-center h-40">
          <Spinner />
          <p className="ml-2">Uploading for AI processing...</p>
        </div>
      ) : fileInfo ? (
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="text-3xl">
              {fileInfo.type === 'application/pdf'
                ? '📄'
                : fileInfo.type.includes('csv') || fileInfo.name.endsWith('.csv')
                  ? '📊'
                  : fileInfo.name.endsWith('.qfx') || fileInfo.name.endsWith('.ofx')
                    ? '🏦'
                    : '📋'}
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

      {/* Queue upload / polling error */}
      {activeQueueError && !isJobParsed && (jobId !== null || pendingPdfFile !== null) && (
        <div className="my-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-left">
          <p className="text-red-600 dark:text-red-400 mb-2">{activeQueueError}</p>
          <div className="flex gap-2">
            {pendingPdfFile && (
              <Button variant="outline" size="sm" onClick={processWithQueue}>
                Retry
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={clearData}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* PDF pending: show "Process with AI" button */}
      {pendingPdfFile && !loading && !queueUploading && !jobId && !activeQueueError && (
        <div className="my-3">
          <Button onClick={processWithQueue} data-testid="process-with-ai">Process with AI</Button>
          <Button variant="outline" className="ml-2" onClick={clearData}>
            Clear
          </Button>
        </div>
      )}

      {/* Job is queued or processing — show status message */}
      {jobId && isJobActive && (
        <div className="my-3 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-left">
          <div className="flex items-center gap-2 mb-2">
            <Spinner />
            <span className="font-medium text-blue-700 dark:text-blue-300">
              {jobStatus === 'processing' ? 'Processing with AI…' : 'Queued for AI processing…'}
            </span>
          </div>
          <p className="text-sm text-blue-600 dark:text-blue-400">
            Your file is in the queue and will be processed shortly. You can leave this page and come back.
          </p>
        </div>
      )}

      {/* Job deferred to tomorrow */}
      {jobId && isJobDeferred && (
        <div className="my-3 p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg text-left">
          <p className="font-medium text-yellow-700 dark:text-yellow-300">Processing deferred</p>
          <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
            {estimatedWait ?? 'Your file will be processed when quota resets.'}
          </p>
        </div>
      )}

      {/* Job failed */}
      {jobId && isJobFailed && (
        <div className="my-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-left">
          <p className="text-red-600 dark:text-red-400 mb-2">
            {jobPollingError ?? 'AI processing failed. Please try again.'}
          </p>
          <Button variant="outline" size="sm" onClick={clearData}>
            Clear
          </Button>
        </div>
      )}

      {/* PDF statement preview card — single account or per-block for multi-account */}
      {pdfData && pdfAccountBlocks.length > 0 && (
        <div className="my-3 text-left space-y-4">
          {pdfAccountBlocks.map((block, idx) => {
            const mapping = accountMappings[idx]
            const targetId = mapping?.targetAccountId ?? accountId
            const blockHasDetails = (block.statementDetails?.length ?? 0) > 0
            const blockTxCount = block.transactions?.length ?? 0
            const blockLotsCount = block.lots?.length ?? 0
            const parsedAcctNum = block.statementInfo?.accountNumber
            const parsedAcctName = block.statementInfo?.accountName
            const showAccountSelector = pdfAccountBlocks.length > 1 || !!(parsedAcctNum && parsedAcctNum !== '')

            return (
              <div
                key={idx}
                className={`border rounded-lg p-4 ${pdfAccountBlocks.length > 1 ? 'border-blue-200 dark:border-blue-800' : ''}`}
              >
                {pdfAccountBlocks.length > 1 && (
                  <div className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">
                    Account {idx + 1} of {pdfAccountBlocks.length}
                  </div>
                )}
                {parsedAcctNum && (
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Parsed account: <span className="font-mono">{parsedAcctNum}</span>
                    {parsedAcctName && <span className="ml-1">({parsedAcctName})</span>}
                  </div>
                )}
                {showAccountSelector && (
                  <div className="flex items-center gap-2 mb-3">
                    <Label className="whitespace-nowrap text-sm">Import into:</Label>
                    <Select
                      value={String(targetId)}
                      onValueChange={(v) => {
                        const newMappings = [...accountMappings]
                        newMappings[idx] = { targetAccountId: parseInt(v) }
                        setAccountMappings(newMappings)
                      }}
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        {allAccounts.map((a) => (
                          <SelectItem key={a.acct_id} value={String(a.acct_id)}>
                            {a.acct_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {blockTxCount > 0 && (
                    <span className="mr-3">
                      {blockTxCount} transaction{blockTxCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {blockHasDetails && <span className="mr-3">Statement details</span>}
                  {blockLotsCount > 0 && (
                    <span>
                      {blockLotsCount} lot{blockLotsCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {blockHasDetails && block.statementDetails && (
                  <PdfStatementPreviewCard
                    statementInfo={block.statementInfo}
                    statementDetails={block.statementDetails}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Statement preview card */}
      {statement && <StatementPreviewCard statement={statement} />}

      {/* Show import button if we have data, statement details, or lots */}
      {(effectiveData && effectiveData.length > 0) || hasStatementDetails || hasLots || pdfAccountBlocks.length > 1 ? (
        <div style={{ textAlign: 'left' }}>
          {/* Post-AI import options for PDF data */}
          {pdfData && (transactionCount > 0 || multiAccountTransactionCount > 0 || hasStatementDetails) && (
            <div className="flex items-center gap-4 my-3">
              {(transactionCount > 0 || multiAccountTransactionCount > 0) && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="import-transactions"
                    checked={importTransactions}
                    onCheckedChange={(checked) => setImportTransactions(checked === true)}
                  />
                  <Label htmlFor="import-transactions">Import Transactions</Label>
                </div>
              )}
              {hasStatementDetails && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="attach-statement"
                    checked={attachAsStatement}
                    onCheckedChange={(checked) => setAttachAsStatement(checked === true)}
                  />
                  <Label htmlFor="attach-statement">Attach as Statement</Label>
                </div>
              )}
            </div>
          )}
          <div className="my-2">
            <Button
              className="mr-2"
              onClick={(e) => {
                e.preventDefault()
                handleImport(effectiveData ?? [], statement)
              }}
              disabled={loading || isImporting || !hasImportableContent}
            >
              {importButtonText}
            </Button>
            <Button variant="outline" onClick={clearData} disabled={loading || isImporting}>
              Clear
            </Button>
          </div>
          {effectiveData && effectiveData.length > 0 && <TransactionsTable data={effectiveData} />}
        </div>
      ) : null}
      {/* Show clear button if we have file info but no valid data and not a pending PDF */}
      {fileInfo &&
        !effectiveData &&
        !loading &&
        !pendingPdfFile &&
        !jobId &&
        !hasStatementDetails &&
        !hasLots &&
        pdfAccountBlocks.length === 0 &&
        !activeQueueError && (
          <div className="mt-4">
            <Button variant="outline" onClick={clearData}>
              Clear
            </Button>
          </div>
        )}
    </div>
    </>
  )
}
