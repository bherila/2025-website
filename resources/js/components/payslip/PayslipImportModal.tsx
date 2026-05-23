'use client'

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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { fetchWrapper } from '@/fetchWrapper'
import { useGenAiFileUpload } from '@/genai-processor/useGenAiFileUpload'

import { PayslipImportJobCard } from './PayslipImportJobCard'

interface PayslipImportModalProps {
  onImportSuccess: () => void
}

export interface W2JobOption {
  id: number
  display_name: string
}

interface PendingJob {
  jobId: number
  filename: string
  employmentEntityId: number | null
}

const MAX_FILE_BYTES = 50 * 1024 * 1024

export function PayslipImportModal({ onImportSuccess }: PayslipImportModalProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [jobs, setJobs] = useState<PendingJob[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [w2Jobs, setW2Jobs] = useState<W2JobOption[]>([])
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { upload } = useGenAiFileUpload({
    jobType: 'finance_payslip',
    context: {
      file_count: 1,
      ...(selectedEntityId ? { employment_entity_id: selectedEntityId } : {}),
    },
  })

  const fetchW2Jobs = useCallback(async () => {
    try {
      const data = await fetchWrapper.get('/api/finance/employment-entities?visible_only=true') as {
        id: number
        display_name: string
        type: string
        start_date: string
      }[]

      const w2Only = data
        .filter((entity) => entity.type === 'w2')
        .sort((a, b) => b.start_date.localeCompare(a.start_date))
        .map(({ id, display_name }) => ({ id, display_name }))

      setW2Jobs(w2Only)
      setSelectedEntityId((current) => current ?? w2Only[0]?.id ?? null)
    } catch {
      setW2Jobs([])
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchW2Jobs()
    }
  }, [fetchW2Jobs, open])

  const resetModalState = () => {
    setSelectedFiles([])
    setJobs([])
    setUploadError(null)
    setUploading(false)
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
      setSelectedFiles((prev) => [...prev, ...added])
    }
  }

  const removeSelected = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, currentIndex) => currentIndex !== index))
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
        setJobs((prev) => [
          ...prev,
          {
            jobId: result.jobId,
            filename: file.name,
            employmentEntityId: selectedEntityId,
          },
        ])
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : `Upload failed for ${file.name}`)
      }
    }

    setUploading(false)
  }, [selectedEntityId, selectedFiles, upload])

  const handleJobFinalized = useCallback(() => {
    onImportSuccess()
  }, [onImportSuccess])

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
        <Button variant="outline" size="sm">
          <Upload className="h-3.5 w-3.5" /> Import PDF
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!uploading} className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Import Payslips from PDF</DialogTitle>
          <DialogDescription>
            Uploads run in the background. Each PDF becomes a GenAI job that you can review result-by-result before
            creating payslip rows. The pipeline uses your active AI provider, whether that is Anthropic, Bedrock, or
            Gemini.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {w2Jobs.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="import-w2-job">W-2 Job</Label>
              <select
                id="import-w2-job"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                value={selectedEntityId ?? ''}
                onChange={(event) => setSelectedEntityId(event.target.value ? Number(event.target.value) : null)}
                disabled={uploading}
              >
                <option value="">No job associated</option>
                {w2Jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.display_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div
            className="cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:border-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">Click to select payslip PDFs</p>
              <p className="text-xs text-muted-foreground">Up to 50 MB per file. Each file becomes its own review job.</p>
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
                  <li
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    className="flex items-center justify-between rounded bg-muted/40 px-2 py-1"
                  >
                    <span className="truncate">{file.name}</span>
                    <Button variant="ghost" size="sm" disabled={uploading} onClick={() => removeSelected(index)}>
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
              {jobs.map((job) => (
                <PayslipImportJobCard
                  key={job.jobId}
                  jobId={job.jobId}
                  filename={job.filename}
                  defaultEmploymentEntityId={job.employmentEntityId}
                  w2Jobs={w2Jobs}
                  onResultFinalized={handleJobFinalized}
                />
              ))}
            </div>
          )}

          {jobs.length === 0 && selectedFiles.length === 0 && (
            <p className="text-xs text-muted-foreground">
              You need an AI configuration in your <a href="/dashboard" className="underline">account settings</a> to use
              this feature. Queue state is also visible in <a className="underline" href="/admin/genai-jobs">Admin →
              GenAI Jobs</a> for admins.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
