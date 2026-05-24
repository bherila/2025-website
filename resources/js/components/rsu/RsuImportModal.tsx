'use client'

import { Upload } from 'lucide-react'
import * as React from 'react'
import { useCallback, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useGenAiFileUpload } from '@/genai-processor/useGenAiFileUpload'

import { RsuImportJobCard } from './RsuImportJobCard'

interface RsuImportModalProps {
  onImportSuccess: () => void
}

interface PendingJob {
  jobId: number
  filename: string
}

const MAX_FILE_BYTES = 50 * 1024 * 1024

export function RsuImportModal({ onImportSuccess }: RsuImportModalProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [jobs, setJobs] = useState<PendingJob[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [defaultSymbol, setDefaultSymbol] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const normalizedDefaultSymbol = defaultSymbol.trim().toUpperCase()
  const { upload } = useGenAiFileUpload({
    jobType: 'equity_award',
    context: {
      file_count: 1,
      ...(normalizedDefaultSymbol ? { default_symbol: normalizedDefaultSymbol } : {}),
    },
  })

  const resetModalState = () => {
    setSelectedFiles([])
    setJobs([])
    setUploadError(null)
    setUploading(false)
    setDefaultSymbol('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null)
    const picked = event.target.files
    if (!picked) return

    const added: File[] = []
    const errors: string[] = []

    Array.from(picked).forEach((file) => {
      const lowerName = file.name.toLowerCase()
      const isPdfMime = file.type === 'application/pdf'
      const hasPdfExtension = lowerName.endsWith('.pdf')

      if (!isPdfMime && !hasPdfExtension) {
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
      setSelectedFiles((previous) => [...previous, ...added])
    }
  }

  const removeSelected = (index: number) => {
    setSelectedFiles((previous) => previous.filter((_, currentIndex) => currentIndex !== index))
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
        setJobs((previous) => [...previous, { jobId: result.jobId, filename: file.name }])
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : `Upload failed for ${file.name}`)
      }
    }

    setUploading(false)
  }, [selectedFiles, upload])

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && uploading) return
    if (!nextOpen) {
      resetModalState()
    }
    setOpen(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Import PDF
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!uploading} className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import RSU Awards</DialogTitle>
          <DialogDescription>Upload grant letters or vest confirmations, then review each parsed vest.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="rsu-default-symbol">Default symbol</Label>
            <Input
              id="rsu-default-symbol"
              maxLength={4}
              value={defaultSymbol}
              onChange={(event) => setDefaultSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 4))}
              placeholder="META"
            />
          </div>

          <div
            className="cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:border-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">Select PDF files</p>
              <p className="text-xs text-muted-foreground">Up to 50 MB per file. Each file becomes its own import job.</p>
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
                {selectedFiles.map((file, index) => (
                  <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1">
                    <span className="truncate">{file.name}</span>
                    <Button variant="ghost" size="sm" disabled={uploading} onClick={() => removeSelected(index)}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
              <Button onClick={startUpload} disabled={uploading} className="w-full">
                {uploading ? 'Uploading...' : `Upload ${selectedFiles.length} file(s)`}
              </Button>
            </div>
          )}

          {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

          {jobs.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">In-flight imports</p>
              {jobs.map((job) => (
                <RsuImportJobCard
                  key={job.jobId}
                  jobId={job.jobId}
                  filename={job.filename}
                  onResultFinalized={onImportSuccess}
                />
              ))}
            </div>
          )}

          {jobs.length === 0 && selectedFiles.length === 0 && (
            <p className="text-xs text-muted-foreground">
              You need an active AI provider configured in account settings before uploading PDFs.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={uploading}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
