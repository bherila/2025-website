'use client'

import { FileUp, Loader2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fetchWrapper } from '@/fetchWrapper'
import { computeFileSHA256 } from '@/lib/fileUtils'

interface FinanceAccount {
  acct_id: number
  acct_name: string
  acct_number?: string | null
}

interface DocumentImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

type UploadPhase = 'idle' | 'requesting' | 'uploading' | 'saving'

const TAX_FORM_TYPES = [
  { value: 'w2', label: 'W-2' },
  { value: '1099_int', label: '1099-INT' },
  { value: '1099_div', label: '1099-DIV' },
  { value: '1099_b', label: '1099-B' },
  { value: 'broker_1099', label: 'Broker 1099' },
  { value: '1099_r', label: '1099-R' },
  { value: '1099_misc', label: '1099-MISC' },
  { value: '1099_nec', label: '1099-NEC' },
  { value: 'k1', label: 'K-1' },
  { value: '1116', label: '1116' },
]

const ACCOUNT_FORM_TYPES = new Set(['1099_int', '1099_div', '1099_b', 'broker_1099', '1099_r', '1099_misc', '1099_nec', 'k1', '1116'])

export default function DocumentImportModal({ open, onOpenChange, onImported }: DocumentImportModalProps) {
  const [taxYear, setTaxYear] = useState(String(new Date().getFullYear()))
  const [formType, setFormType] = useState('broker_1099')
  const [accountId, setAccountId] = useState<string>('none')
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setError(null)
    setPhase('idle')
    setSelectedFileName(null)
    void fetchWrapper.get('/api/finance/accounts')
      .then((response) => {
        const payload = response as {
          accounts?: FinanceAccount[]
          assetAccounts?: FinanceAccount[]
          liabilityAccounts?: FinanceAccount[]
          retirementAccounts?: FinanceAccount[]
        } | FinanceAccount[]
        setAccounts(Array.isArray(payload)
          ? payload
          : [
              ...(payload.accounts ?? []),
              ...(payload.assetAccounts ?? []),
              ...(payload.liabilityAccounts ?? []),
              ...(payload.retirementAccounts ?? []),
            ])
      })
      .catch(() => setAccounts([]))
  }, [open])

  const isBusy = phase !== 'idle'

  const uploadFile = useCallback(async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError('Choose a file first.')
      return
    }

    const parsedTaxYear = Number.parseInt(taxYear, 10)
    if (!Number.isInteger(parsedTaxYear) || parsedTaxYear < 1900 || parsedTaxYear > 2100) {
      setError('Enter a valid tax year.')
      return
    }

    try {
      setError(null)
      setPhase('requesting')
      const fileHash = await computeFileSHA256(file)
      const uploadRequest = await fetchWrapper.post('/api/finance/documents/request-upload', {
        filename: file.name,
        document_kind: 'tax_form',
        content_type: file.type || 'application/octet-stream',
        file_size: file.size,
      }) as { upload_url: string; s3_key: string }

      setPhase('uploading')
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadRequest.upload_url)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve()
          } else {
            reject(new Error(`Upload failed: HTTP ${xhr.status}`))
          }
        }
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.send(file)
      })

      setPhase('saving')
      await fetchWrapper.post('/api/finance/documents', {
        document_kind: 'tax_form',
        s3_key: uploadRequest.s3_key,
        original_filename: file.name,
        form_type: formType,
        tax_year: parsedTaxYear,
        file_size_bytes: file.size,
        file_hash: fileHash,
        mime_type: file.type || 'application/octet-stream',
        ...(ACCOUNT_FORM_TYPES.has(formType) && accountId !== 'none' ? { account_id: Number.parseInt(accountId, 10) } : {}),
      })

      toast.success('Document imported')
      onImported()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed'
      setError(message)
      toast.error(message)
    } finally {
      setPhase('idle')
    }
  }, [accountId, formType, onImported, onOpenChange, taxYear])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import Document</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="document-file">File</Label>
            <button
              type="button"
              className="flex min-h-28 w-full items-center justify-center rounded-md border border-dashed bg-muted/30 px-4 py-5 text-sm text-muted-foreground hover:bg-muted/50"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="flex items-center gap-2">
                <FileUp className="h-4 w-4" />
                {selectedFileName ?? 'Choose File'}
              </span>
            </button>
            <Input
              id="document-file"
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.heic,.json"
              onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? null)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div className="grid gap-2">
              <Label>Form</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAX_FORM_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="document-tax-year">Year</Label>
              <Input
                id="document-tax-year"
                inputMode="numeric"
                value={taxYear}
                onChange={(event) => setTaxYear(event.target.value)}
              />
            </div>
          </div>

          {ACCOUNT_FORM_TYPES.has(formType) && (
            <div className="grid gap-2">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.acct_id} value={String(account.acct_id)}>
                      {account.acct_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
              Cancel
            </Button>
            <Button type="button" className="gap-2" onClick={() => void uploadFile()} disabled={isBusy}>
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
