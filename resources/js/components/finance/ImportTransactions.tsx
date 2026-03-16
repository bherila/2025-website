import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { filterOutDuplicates, findDuplicateTransactions } from '@/data/finance/isDuplicateTransaction'
import type { IbStatementData } from '@/data/finance/parseIbCsv'
import { parseImportData } from '@/data/finance/parseImportData'
import { fetchWrapper } from '@/fetchWrapper'
import { buildAccountsContext, matchAccount, type AccountForMatching } from '@/lib/finance/accountMatcher'

import { useFinanceAccounts } from './AccountNavigation'
import { ImportProgressDialog } from './ImportProgressDialog'
import { PdfStatementPreviewCard } from './PdfStatementPreviewCard'
import { StatementPreviewCard } from './StatementPreviewCard'
import TransactionsTable from './TransactionsTable'

const CHUNK_SIZE = 100

/** A single account block within a Gemini response */
export interface GeminiAccountBlock {
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
  lots?: Array<{
    symbol: string
    description?: string
    quantity: number
    purchaseDate: string
    costBasis: number
    costPerUnit?: number
    marketValue?: number
    unrealizedGainLoss?: number
    saleDate?: string
    proceeds?: number
    realizedGainLoss?: number
  }>
}

/** Response structure from the Gemini PDF import endpoint */
interface GeminiImportResponse extends GeminiAccountBlock {
  /** Multi-account responses include this array; single-account responses do not */
  accounts?: GeminiAccountBlock[]
  error?: string
}

/** Information about the dropped/pasted file */
interface FileInfo {
  name: string
  type: string
  size: number
}

/** Per-account mapping: which user account to import this block into */
interface AccountMapping {
  /** acct_id of the selected destination account (null = use page's accountId) */
  targetAccountId: number | null
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
  const [importedStatementId, setImportedStatementId] = useState<number | undefined>(undefined)
  // Pending PDF file waiting for user to click "Process with AI"
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null)
  // Hash of the uploaded PDF (returned after upload so it can be attached to additional accounts)
  const [uploadedFileHash, setUploadedFileHash] = useState<string | null>(null)
  // Gemini-specific error for retry
  const [geminiError, setGeminiError] = useState<string | null>(null)
  // Per-account mappings for multi-account imports: index → target acct_id (null = page accountId)
  const [accountMappings, setAccountMappings] = useState<AccountMapping[]>([])
  // Checkboxes for PDF import options — persisted in localStorage
  // "Import Transactions" and "Attach as Statement" are shown AFTER Gemini parsing
  const [importTransactions, setImportTransactions] = useState(() => {
    try { const v = localStorage.getItem('pdf_import_transactions'); return v === null ? true : v === 'true' } catch { return true }
  })
  const [attachAsStatement, setAttachAsStatement] = useState(() => {
    try { const v = localStorage.getItem('pdf_attach_statement'); return v === null ? true : v === 'true' } catch { return true }
  })
  // "Save File to Storage" is shown at the upload stage (before Gemini)
  const [saveFileToS3, setSaveFileToS3] = useState(() => {
    try { const v = localStorage.getItem('pdf_save_file_s3'); return v === null ? true : v === 'true' } catch { return true }
  })
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch all user accounts (including acct_number for suffix matching)
  const { accounts: allAccounts } = useFinanceAccounts()

  // Adapt accounts for the matcher utility
  const accountsForMatching = useMemo((): AccountForMatching[] => {
    return allAccounts.map(a => ({
      acct_id: a.acct_id,
      acct_name: a.acct_name,
      acct_number: (a as { acct_number?: string | null }).acct_number ?? null,
    }))
  }, [allAccounts])

  // Normalize the pdfData into a list of account blocks
  const pdfAccountBlocks = useMemo((): GeminiAccountBlock[] => {
    if (!pdfData) return []
    if (pdfData.accounts && pdfData.accounts.length > 0) return pdfData.accounts
    // Single-account: wrap in array, omitting undefined properties
    const block: GeminiAccountBlock = {}
    if (pdfData.statementInfo !== undefined) block.statementInfo = pdfData.statementInfo
    if (pdfData.statementDetails !== undefined) block.statementDetails = pdfData.statementDetails
    if (pdfData.transactions !== undefined) block.transactions = pdfData.transactions
    if (pdfData.lots !== undefined) block.lots = pdfData.lots
    return [block]
  }, [pdfData])

  // Auto-detect account mappings when pdfData changes
  useEffect(() => {
    if (!pdfData || pdfAccountBlocks.length === 0) {
      setAccountMappings([])
      return
    }
    const mappings: AccountMapping[] = pdfAccountBlocks.map(block => {
      const parsedNumber = block.statementInfo?.accountNumber ?? null
      const parsedName = block.statementInfo?.accountName ?? null
      const matchedId = matchAccount(parsedNumber, parsedName, accountsForMatching)
      return { targetAccountId: matchedId }
    })
    setAccountMappings(mappings)
  }, [pdfData, pdfAccountBlocks, accountsForMatching])

  // Load all existing transactions upfront (skip if accountId is 'all')
  useEffect(() => {
    if (accountId === 'all') {
      // For "all accounts" page, we can't load existing transactions
      // Multi-account imports will handle duplicate detection per account
      setLoadingExisting(false)
      return
    }

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

  const processChunks = useCallback(async (chunks: AccountLineItem[][], chunkIndex: number, statementId?: number) => {
    if (chunkIndex >= chunks.length) {
      setIsImporting(false)
      const backUrl = accountId === 'all' ? '/finance/account/all/transactions' : `/finance/account/${accountId}/transactions`
      window.location.href = backUrl
      return
    }

    const chunk = chunks[chunkIndex]
    if (!chunk) {
      // Should not happen if logic is correct, but satisfies TypeScript
      setIsImporting(false)
      const backUrl = accountId === 'all' ? '/finance/account/all/transactions' : `/finance/account/${accountId}/transactions`
      window.location.href = backUrl
      return
    }

    try {
      // When accountId is 'all', we should not reach here (multi-account imports use different flow)
      if (accountId === 'all') {
        throw new Error('Cannot import to "all accounts" - please select a specific account')
      }

      await fetchWrapper.post(`/api/finance/${accountId}/line_items`, {
        transactions: chunk,
        statement_id: statementId
      })
      setImportProgress((prev) => ({ ...prev, processed: prev.processed + chunk.length }))
      await processChunks(chunks, chunkIndex + 1, statementId)
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
    
    let statementId: number | undefined

    // Import IB statement first (if available)
    if (statementToImport) {
      // IB statements are single-account, so we can't import to "all"
      if (accountId === 'all') {
        setImportError('IB statement import requires a specific account. Please navigate to a specific account to import IB statements.')
        setIsImporting(false)
        setLoading(false)
        return
      }

      try {
        const response = await fetchWrapper.post(`/api/finance/${accountId}/import-ib-statement`, {
          statement: statementToImport,
        }) as { statement_id: number }
        statementId = response.statement_id
        setImportedStatementId(statementId)
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        setImportError(`Failed to import statement: ${errorMessage}`)
        setIsImporting(false)
        setLoading(false)
        return
      }
    }

    // Multi-account PDF import: use the multi-import endpoint when there are multiple blocks
    // or when the single block targets a different account than the current page account
    const isMultiAccount = pdfData && pdfAccountBlocks.length > 0
    if (isMultiAccount) {
      const hasAnyContent = pdfAccountBlocks.some(block => {
        const hasDetails = (block.statementDetails?.length ?? 0) > 0
        const hasLots = (block.lots?.length ?? 0) > 0
        const hasTx = (block.transactions?.length ?? 0) > 0
        return (importTransactions && hasTx) || (attachAsStatement && hasDetails) || hasLots
      })

      if (hasAnyContent) {
        try {
          const accountsPayload = pdfAccountBlocks.map((block, idx) => {
            const mapping = accountMappings[idx]
            const targetId = mapping?.targetAccountId ?? accountId
            return {
              acct_id: targetId,
              statementInfo: block.statementInfo,
              statementDetails: attachAsStatement ? (block.statementDetails ?? []) : [],
              transactions: importTransactions ? (block.transactions?.map(tx => ({
                t_date: tx.date,
                t_amt: tx.amount,
                t_description: tx.description,
                t_type: tx.type,
              })) ?? []) : [],
              lots: block.lots ?? [],
            }
          })

          const response = await fetchWrapper.post('/api/finance/multi-import-pdf', {
            accounts: accountsPayload,
          }) as { accounts: Array<{ acct_id: number; statement_id: number }> }

          // Use the first statement_id as the primary reference
          if (response.accounts?.length > 0) {
            statementId = response.accounts[0]!.statement_id
            setImportedStatementId(statementId)
          }

          // If we're on the "all" page and need to upload the file, upload to the first account
          if (saveFileToS3 && !uploadedFileHash && pendingPdfFile && response.accounts?.length > 0) {
            try {
              const uploadForm = new FormData()
              uploadForm.append('file', pendingPdfFile)
              const firstAccountId = response.accounts[0]!.acct_id
              const uploadResult = await fetchWrapper.post(`/api/finance/${firstAccountId}/files`, uploadForm) as { file_hash?: string }
              if (uploadResult?.file_hash) {
                setUploadedFileHash(uploadResult.file_hash)
                // Attach to remaining accounts
                for (const acctResult of response.accounts.slice(1)) {
                  try {
                    await fetchWrapper.post(`/api/finance/${acctResult.acct_id}/files/attach`, {
                      file_hash: uploadResult.file_hash,
                      statement_id: acctResult.statement_id,
                    })
                  } catch (attachErr) {
                    console.error(`Failed to attach file to account ${acctResult.acct_id}:`, attachErr)
                  }
                }
              }
            } catch (uploadErr) {
              console.error('Failed to save file to S3:', uploadErr)
            }
          } else if (saveFileToS3 && uploadedFileHash && response.accounts?.length > 1) {
            // Attach the uploaded file to all additional accounts (store PDF once)
            for (const acctResult of response.accounts.slice(1)) {
              try {
                await fetchWrapper.post(`/api/finance/${acctResult.acct_id}/files/attach`, {
                  file_hash: uploadedFileHash,
                  statement_id: acctResult.statement_id,
                })
              } catch (attachErr) {
                console.error(`Failed to attach file to account ${acctResult.acct_id}:`, attachErr)
              }
            }
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e)
          setImportError(`Failed to import multi-account statement: ${errorMessage}`)
          setIsImporting(false)
          setLoading(false)
          return
        }
      }
    } else if (pdfData) {
      // Single-account legacy flow
      // Can't import single-account PDF to "all"
      if (accountId === 'all') {
        setImportError('Single-account PDF import requires a specific account. The multi-account import should have been used instead.')
        setIsImporting(false)
        setLoading(false)
        return
      }

      const hasDetails = (pdfData.statementDetails?.length ?? 0) > 0
      const hasLots = (pdfData.lots?.length ?? 0) > 0
      if ((attachAsStatement || hasLots) && (hasDetails || hasLots)) {
        try {
          const response = await fetchWrapper.post(`/api/finance/${accountId}/import-pdf-statement`, {
            statementInfo: pdfData.statementInfo,
            statementDetails: attachAsStatement ? pdfData.statementDetails : [],
            lots: pdfData.lots,
          }) as { statement_id: number }
          statementId = response.statement_id
          setImportedStatementId(statementId)
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e)
          setImportError(`Failed to import statement details: ${errorMessage}`)
          setIsImporting(false)
          setLoading(false)
          return
        }
      }
    }
    
    // Use the preloaded existing transactions to filter out duplicates
    const transactionsToProcess = importTransactions ? data : []
    const newTransactions = filterOutDuplicates(transactionsToProcess, existingTransactions)
    
    setLoading(false)

    if (newTransactions.length > 0) {
      setDataToImport(newTransactions)
      setImportProgress({ processed: 0, total: newTransactions.length })
      const chunks = []
      for (let i = 0; i < newTransactions.length; i += CHUNK_SIZE) {
        chunks.push(newTransactions.slice(i, i + CHUNK_SIZE))
      }
      await processChunks(chunks, 0, statementId)
    } else {
      setIsImporting(false)
      onImportFinished()
    }
  }, [accountId, existingTransactions, processChunks, onImportFinished, pdfData, pdfAccountBlocks, accountMappings, attachAsStatement, importTransactions, saveFileToS3, uploadedFileHash])

  const clearData = useCallback(() => {
    setText('')
    setFileInfo(null)
    setPdfData(null)
    setPendingPdfFile(null)
    setGeminiError(null)
    setError(null)
    setUploadedFileHash(null)
    setAccountMappings([])
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
    // Include accounts context (name + last4 only, never full numbers) so the LLM
    // can map multi-account statements to the correct user accounts
    const accountsCtx = accountsForMatching
      .filter(a => a.acct_number)
      .map(a => ({
        name: a.acct_name,
        last4: a.acct_number!.replace(/\D/g, '').slice(-4),
      }))
    if (accountsCtx.length > 0) {
      formData.append('accounts', JSON.stringify(accountsCtx))
    }
    try {
      const response = await fetchWrapper.post('/api/finance/transactions/import-gemini', formData) as GeminiImportResponse
      if (response.error) {
        setGeminiError(response.error)
      } else {
        setPdfData(response)
        // Upload file to S3 once (for the current account); for multi-account imports
        // the file will be attached to additional accounts at import time
        // If accountId is 'all', we'll upload to the first matched account later
        if (saveFileToS3 && accountId !== 'all') {
          try {
            const uploadForm = new FormData()
            uploadForm.append('file', pendingPdfFile)
            const uploadResult = await fetchWrapper.post(`/api/finance/${accountId}/files`, uploadForm) as { file_hash?: string }
            if (uploadResult?.file_hash) {
              setUploadedFileHash(uploadResult.file_hash)
            }
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
  }, [pendingPdfFile, saveFileToS3, accountId, accountsForMatching])

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
    processChunks(chunks, failedChunkIndex, importedStatementId)
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

  // Parse PDF data to AccountLineItem format (for single-account or text-based imports)
  const pdfParsedData = useMemo((): AccountLineItem[] | null => {
    // For multi-account PDFs we show per-block previews, not a flat list
    if (pdfAccountBlocks.length > 1) return null
    const transactions = pdfAccountBlocks[0]?.transactions ?? pdfData?.transactions
    if (!transactions || transactions.length === 0) return null
    return transactions.map(tx => {
      const dateStr = tx.date ? tx.date.split(/[ T]/)[0] : ''
      return AccountLineItemSchema.parse({
        t_date: dateStr,
        t_description: tx.description,
        t_amt: tx.amount,
        t_type: tx.type,
      })
    })
  }, [pdfData, pdfAccountBlocks])

  // Helper to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Combine data from text parsing or PDF parsing
  const effectiveData = data ?? pdfParsedData
  
  // Check if we have statement details or lots from PDF (aggregated across all blocks)
  const hasStatementDetails = pdfAccountBlocks.some(b => (b.statementDetails?.length ?? 0) > 0)
  const hasLots = pdfAccountBlocks.some(b => (b.lots?.length ?? 0) > 0)
  const transactionCount = effectiveData?.length ?? 0

  // For multi-account PDF: total transaction count across all blocks
  const multiAccountTransactionCount = useMemo(() => {
    if (pdfAccountBlocks.length <= 1) return 0
    return pdfAccountBlocks.reduce((sum, b) => sum + (b.transactions?.length ?? 0), 0)
  }, [pdfAccountBlocks])
  
  // Build import button text
  const getImportButtonText = () => {
    const parts: string[] = []
    const isMulti = pdfAccountBlocks.length > 1
    if (isMulti) {
      if (importTransactions && multiAccountTransactionCount > 0) {
        parts.push(`${multiAccountTransactionCount} Transaction${multiAccountTransactionCount !== 1 ? 's' : ''}`)
      }
      const statementCount = pdfAccountBlocks.filter(b => attachAsStatement && (b.statementDetails?.length ?? 0) > 0).length
      if (statementCount > 0) parts.push(`${statementCount} Statement${statementCount !== 1 ? 's' : ''}`)
      const lotsCount = pdfAccountBlocks.reduce((s, b) => s + (b.lots?.length ?? 0), 0)
      if (lotsCount > 0) parts.push(`${lotsCount} Lot${lotsCount !== 1 ? 's' : ''}`)
    } else {
      if (importTransactions && transactionCount > 0) {
        parts.push(`${transactionCount} Transaction${transactionCount !== 1 ? 's' : ''}`)
      }
      if (statement) {
        parts.push('1 Statement')
      } else if (attachAsStatement && hasStatementDetails) {
        parts.push('1 Statement')
      }
      if (hasLots) {
        const lotsCount = pdfAccountBlocks[0]?.lots?.length ?? 0
        parts.push(`${lotsCount} Lot${lotsCount !== 1 ? 's' : ''}`)
      }
    }
    if (parts.length === 0) return 'Import'
    return `Import ${parts.join(' and ')}`
  }

  // Determine if there is anything to import
  const hasImportableContent = pdfAccountBlocks.length > 1
    ? pdfAccountBlocks.some(b =>
        (importTransactions && (b.transactions?.length ?? 0) > 0) ||
        (attachAsStatement && (b.statementDetails?.length ?? 0) > 0) ||
        (b.lots?.length ?? 0) > 0
      )
    : (importTransactions && transactionCount > 0) || 
      (attachAsStatement && hasStatementDetails) ||
      hasLots ||
      !!statement

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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={processPdfWithGemini}>
              Retry
            </Button>
            <Button variant="outline" size="sm" onClick={clearData}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* PDF pending: show "Save to Storage" option and "Process with AI" button */}
      {pendingPdfFile && !loading && !pdfData && !geminiError && (
        <div className="my-3">
          <div className="flex items-center gap-4 mb-3 justify-center">
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
          <Button onClick={processPdfWithGemini}>
            Process with AI
          </Button>
          <Button variant="outline" className="ml-2" onClick={clearData}>
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
              <div key={idx} className={`border rounded-lg p-4 ${pdfAccountBlocks.length > 1 ? 'border-blue-200 dark:border-blue-800' : ''}`}>
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
                        {allAccounts.map(a => (
                          <SelectItem key={a.acct_id} value={String(a.acct_id)}>
                            {a.acct_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {blockTxCount > 0 && <span className="mr-3">{blockTxCount} transaction{blockTxCount !== 1 ? 's' : ''}</span>}
                  {blockHasDetails && <span className="mr-3">Statement details</span>}
                  {blockLotsCount > 0 && <span>{blockLotsCount} lot{blockLotsCount !== 1 ? 's' : ''}</span>}
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

      {currentDuplicates.length > 0 && (
        <div className="my-2 text-red-500">
          <p>{currentDuplicates.length} duplicate transactions were found and will not be imported. They are highlighted in the table below.</p>
        </div>
      )}

      {/* Statement preview card */}
      {statement && <StatementPreviewCard statement={statement} />}

      {/* Show import button if we have data, statement details, or lots */}
      {(effectiveData && effectiveData.length > 0) || hasStatementDetails || hasLots || pdfAccountBlocks.length > 1 ? (
        <div style={{textAlign: 'left'}}>
          {/* Post-Gemini import options for PDF data */}
          {pdfData && (transactionCount > 0 || multiAccountTransactionCount > 0 || hasStatementDetails) && (
            <div className="flex items-center gap-4 my-3">
              {(transactionCount > 0 || multiAccountTransactionCount > 0) && (
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
              )}
              {hasStatementDetails && (
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
              {getImportButtonText()}
            </Button>
            <Button variant="outline" onClick={clearData} disabled={loading || isImporting}>
              Clear
            </Button>
          </div>
          {effectiveData && effectiveData.length > 0 && (
            <TransactionsTable data={effectiveData} duplicates={currentDuplicates} />
          )}
        </div>
      ) : null}
      {/* Show clear button if we have file info but no valid data and not a pending PDF and not already shown in other blocks */}
      {fileInfo && !effectiveData && !loading && !pendingPdfFile && !hasStatementDetails && !hasLots && pdfAccountBlocks.length === 0 && !geminiError && (
        <div className="mt-4">
          <Button variant="outline" onClick={clearData}>
            Clear
          </Button>
        </div>
      )}
    </div>
  )
}
