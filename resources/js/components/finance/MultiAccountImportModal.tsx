'use client'

import { AlertCircle, CheckCircle, Clock, Loader2, Upload } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import type { TaxDocumentAccountLink } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'

export interface FinAccount {
  acct_id: number
  acct_name: string
  acct_number?: string | null
}

interface MultiAccountImportModalProps {
  open: boolean
  taxYear: number
  accounts: FinAccount[]
  onClose: () => void
  onSuccess: () => void
  /**
   * When set, the modal is operating in "single-account consolidated" mode.
   * The specified account is pre-assigned to all detected form/link rows, and the
   * title reflects the source account. The user can still reassign individual rows.
   */
  preselectedAccountId?: number | null
}

type Phase = 'upload' | 'polling' | 'assign'

interface ParsedLink {
  /** Matches a TaxDocumentAccountLink once the job finishes */
  id: number
  account_id: number | null
  form_type: string
  tax_year: number
  /** AI-detected account identifier — stored directly on the join row. */
  ai_identifier: string | null
  /** AI-detected account name — stored directly on the join row. */
  ai_account_name: string | null
  account: { acct_id: number; acct_name: string } | null
}

export default function MultiAccountImportModal({
  open,
  taxYear,
  accounts,
  onClose,
  onSuccess,
  preselectedAccountId = null,
}: MultiAccountImportModalProps) {
  const [phase, setPhase] = useState<Phase>('upload')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taxDocId, setTaxDocId] = useState<number | null>(null)
  const [links, setLinks] = useState<ParsedLink[]>([])
  const [confirming, setConfirming] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = () => {
    setPhase('upload')
    setUploading(false)
    setError(null)
    setTaxDocId(null)
    setLinks([])
    setConfirming(false)
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
    }
  }

  const handleClose = () => {
    // If we already processed and set up links but the user closed without confirming,
    // still trigger a reload so the parent shows the auto-created links from ParseImportJob.
    const wasProcessed = phase === 'assign' || phase === 'polling'
    reset()
    onClose()
    if (wasProcessed) {
      onSuccess()
    }
  }

  const pollJob = useCallback(
    async (docId: number, attempt = 0) => {
      try {
        const doc = (await fetchWrapper.get(`/api/finance/tax-documents/${docId}`)) as {
          id: number
          genai_status: string | null
          account_links: TaxDocumentAccountLink[]
        }

        if (doc.genai_status === 'parsed') {
          // Build editable link list from the join table rows.
          // ai_identifier and ai_account_name are now stored directly on each link row.
          const enriched: ParsedLink[] = doc.account_links.map(link => ({
            ...link,
            // In single-account mode, apply the preselected account to any unresolved rows.
            account_id: link.account_id ?? (preselectedAccountId ?? null),
          }))
          setLinks(enriched)
          setPhase('assign')
          return
        }

        if (doc.genai_status === 'failed') {
          setError('AI processing failed. Please try again or use the standard single-account upload.')
          setPhase('upload')
          return
        }

        // Still pending/processing — keep polling (up to ~5 min)
        if (attempt < 60) {
          pollTimerRef.current = setTimeout(() => pollJob(docId, attempt + 1), 5_000)
        } else {
          setError('Processing timed out. Check the document status on the Tax Preview page.')
          setPhase('upload')
        }
      } catch {
        if (attempt < 3) {
          pollTimerRef.current = setTimeout(() => pollJob(docId, attempt + 1), 3_000)
        } else {
          setError('Failed to check processing status.')
          setPhase('upload')
        }
      }
    },
    [preselectedAccountId],
  )

  const handleFileSelect = async (file: File) => {
    setUploading(true)
    setError(null)

    try {
      // Step 1: request pre-signed upload URL (reuse the standard endpoint)
      const uploadResp = (await fetchWrapper.post('/api/finance/tax-documents/request-upload', {
        filename: file.name,
        content_type: file.type || 'application/pdf',
        file_size: file.size,
      })) as { upload_url: string; s3_key: string }

      // Step 2: PUT file to S3
      const putResp = await fetch(uploadResp.upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/pdf' },
      })
      if (!putResp.ok) {
        throw new Error(`S3 upload failed: ${putResp.status}`)
      }

      // Step 3: compute SHA-256 hash
      const buffer = await file.arrayBuffer()
      const hashBuf = await crypto.subtle.digest('SHA-256', buffer)
      const hashHex = Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      // Step 4: create the multi-account import job.
      // In single-account mode, put the preselected account first so server-side matching
      // prioritises it. Pass all other accounts as additional context hints.
      const preselected = preselectedAccountId != null
        ? accounts.find(a => a.acct_id === preselectedAccountId)
        : null
      const orderedAccounts = preselected
        ? [preselected, ...accounts.filter(a => a.acct_id !== preselectedAccountId)]
        : accounts
      const accountHints = orderedAccounts.map(a => ({
        name: a.acct_name,
        last4: a.acct_number ? a.acct_number.slice(-4) : undefined,
      }))

      const doc = (await fetchWrapper.post('/api/finance/tax-documents/multi-account', {
        s3_key: uploadResp.s3_key,
        original_filename: file.name,
        tax_year: taxYear,
        file_size_bytes: file.size,
        file_hash: hashHex,
        mime_type: file.type || 'application/pdf',
        context_accounts: accountHints,
      })) as { id: number }

      setTaxDocId(doc.id)
      setPhase('polling')
      pollJob(doc.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelect(file)
  }

  const updateLinkAccount = (linkId: number, accountId: number | null) => {
    setLinks(prev => prev.map(l => l.id === linkId ? { ...l, account_id: accountId } : l))
  }

  const handleConfirm = async () => {
    if (!taxDocId) return
    setConfirming(true)
    try {
      await fetchWrapper.post(`/api/finance/tax-documents/${taxDocId}/accounts`, {
        links: links.map(l => ({
          account_id: l.account_id,
          form_type: l.form_type,
          tax_year: l.tax_year,
          ai_identifier: l.ai_identifier ?? undefined,
          ai_account_name: l.ai_account_name ?? undefined,
        })),
      })
      toast.success('Multi-account import confirmed')
      reset()
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account links')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={open => !open && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {preselectedAccountId != null
              ? `Import Consolidated 1099 — ${accounts.find(a => a.acct_id === preselectedAccountId)?.acct_name ?? 'Account'} — ${taxYear}`
              : `Multi-Account Import — ${taxYear}`}
          </DialogTitle>
        </DialogHeader>

        {phase === 'upload' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {preselectedAccountId != null
                ? 'Upload a consolidated brokerage PDF (e.g. Fidelity Tax Reporting Statement, Wealthfront 1099) for this account. The AI will detect each form type (1099-DIV, 1099-INT, 1099-B, etc.) automatically and import the transaction lots.'
                : 'Upload a consolidated brokerage PDF (e.g. Fidelity Tax Reporting Statement) that contains forms for multiple accounts. The AI will detect each account/form combination automatically.'}
            </p>
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
              ) : (
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              )}
              <p className="text-sm font-medium">
                {uploading ? 'Uploading…' : 'Drop PDF here or click to select'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">PDF up to 100 MB</p>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        {phase === 'polling' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Clock className="h-10 w-10 text-muted-foreground animate-pulse" />
            <p className="text-sm text-center text-muted-foreground">
              Your document is queued for AI processing. This may take up to a minute.
              <br />
              You can leave this page and the import will complete in the background.
            </p>
          </div>
        )}

        {phase === 'assign' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The AI detected the following account/form combinations. Verify or correct the account
              assignments, then click Confirm.
            </p>
            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Detected Account</TableHead>
                    <TableHead>Form Type</TableHead>
                    <TableHead>Assign To</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map(link => (
                    <TableRow key={link.id}>
                      <TableCell className="text-sm">
                        <span className="font-medium">{link.ai_account_name ?? '—'}</span>
                        {link.ai_identifier && (
                          <span className="ml-1 text-muted-foreground text-xs">({link.ai_identifier})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {FORM_TYPE_LABELS[link.form_type] ?? link.form_type}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={link.account_id?.toString() ?? 'unresolved'}
                          onValueChange={val =>
                            updateLinkAccount(link.id, val === 'unresolved' ? null : Number(val))
                          }
                        >
                          <SelectTrigger className="h-7 text-xs w-48">
                            <SelectValue placeholder="Select account…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unresolved">
                              <span className="text-muted-foreground">— Unresolved —</span>
                            </SelectItem>
                            {accounts.map(a => (
                              <SelectItem key={a.acct_id} value={a.acct_id.toString()}>
                                {a.acct_name}
                                {a.acct_number && (
                                  <span className="ml-1 text-muted-foreground">
                                    (…{a.acct_number.slice(-4)})
                                  </span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {link.account_id != null ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {links.some(l => l.account_id == null) && (
              <p className="text-xs text-amber-600">
                Unresolved accounts will be saved without an account assignment. You can update them later.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={confirming}>
            Cancel
          </Button>
          {phase === 'assign' && (
            <Button onClick={handleConfirm} disabled={confirming}>
              {confirming && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
