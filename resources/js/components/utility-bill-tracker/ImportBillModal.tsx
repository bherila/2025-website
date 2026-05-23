import { Upload } from 'lucide-react'
import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useGenAiFileUpload } from '@/genai-processor/useGenAiFileUpload'

import { UtilityBillJobCard } from './UtilityBillJobCard'

interface ImportBillModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: number
  accountType: 'Electricity' | 'General'
  onImported: () => void
}

interface PendingJob {
  jobId: number
  filename: string
}

const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB request-upload limit

export function ImportBillModal({ open, onOpenChange, accountId, accountType, onImported }: ImportBillModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [jobs, setJobs] = useState<PendingJob[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { upload } = useGenAiFileUpload({
    jobType: 'utility_bill',
    context: {
      account_type: accountType,
      utility_account_id: accountId,
      file_count: 1,
    },
  })

  useEffect(() => {
    if (!open) {
      setSelectedFiles([])
      setJobs([])
      setUploadError(null)
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [open])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null)
    const picked = e.target.files
    if (!picked) return

    const added: File[] = []
    const errors: string[] = []
    Array.from(picked).forEach((file) => {
      if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        errors.push(`${file.name}: not a PDF`)
        return
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push(`${file.name}: exceeds 50 MB`)
        return
      }
      added.push(file)
    })

    if (errors.length > 0) {
      setUploadError(errors.join('; '))
    }
    if (added.length > 0) {
      setSelectedFiles((prev) => [...prev, ...added])
    }
  }

  const removeSelected = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  const startUpload = useCallback(async () => {
    if (selectedFiles.length === 0) return

    setUploading(true)
    setUploadError(null)

    const files = [...selectedFiles]
    setSelectedFiles([])

    for (const file of files) {
      try {
        const result = await upload(file)
        setJobs((prev) => [...prev, { jobId: result.jobId, filename: file.name }])
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : `Upload failed for ${file.name}`)
      }
    }

    setUploading(false)
  }, [selectedFiles, upload])

  const handleJobFinalized = useCallback(() => {
    // A result was imported — refresh the parent list so the new bill shows up.
    onImported()
  }, [onImported])

  const handleClose = () => {
    if (uploading) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent showCloseButton={!uploading} className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Bills from PDF</DialogTitle>
          <DialogDescription>
            Uploads run in the background. Files are queued for AI parsing — you can leave this dialog open or
            close it; in-flight jobs continue server-side and remain visible in{' '}
            <a className="underline" href="/admin/genai-jobs">Admin → GenAI Jobs</a> (admins) or via the queue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div
            className="cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:border-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center space-y-2">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">Click to select PDF files</p>
              <p className="text-xs text-muted-foreground">Up to 50 MB per file. Each file becomes its own job.</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {selectedFiles.length > 0 && (
            <div className="space-y-2 rounded border p-3">
              <p className="text-sm font-medium">{selectedFiles.length} file(s) ready to upload:</p>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-sm">
                {selectedFiles.map((file, idx) => (
                  <li key={`${file.name}-${idx}`} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1">
                    <span className="truncate">{file.name}</span>
                    <Button variant="ghost" size="sm" disabled={uploading} onClick={() => removeSelected(idx)}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
              <Button onClick={startUpload} disabled={uploading} className="w-full">
                {uploading ? 'Uploading…' : `Upload ${selectedFiles.length} file(s)`}
              </Button>
            </div>
          )}

          {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

          {jobs.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">In-flight imports</p>
              {jobs.map((j) => (
                <UtilityBillJobCard
                  key={j.jobId}
                  jobId={j.jobId}
                  filename={j.filename}
                  accountId={accountId}
                  accountType={accountType}
                  onResultFinalized={handleJobFinalized}
                />
              ))}
            </div>
          )}

          {jobs.length === 0 && selectedFiles.length === 0 && (
            <p className="text-xs text-muted-foreground">
              You need an AI provider configured in your{' '}
              <a href="/dashboard" className="underline">account settings</a> to use this feature. Parsing uses whichever
              provider you have set as active (Anthropic, Bedrock, or Gemini).
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={uploading}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
