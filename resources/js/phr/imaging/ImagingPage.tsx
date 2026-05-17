import { AlertCircle, CheckCircle2, Download, ExternalLink, Images, Loader2, RefreshCcw, UploadCloud, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { fetchWrapper } from '@/fetchWrapper'
import { errorMessage } from '@/phr/shared'
import {
  PhrDicomStudiesResponseSchema,
  type PhrDicomStudy,
  PhrDicomUploadFileResponseSchema,
  PhrDicomUploadResponseSchema,
} from '@/phr/types'

type FileWithRelativePath = File

interface DirectoryInputAttributes {
  webkitdirectory: string
  directory: string
}

const directoryInputAttributes: DirectoryInputAttributes = {
  webkitdirectory: '',
  directory: '',
}

const UPLOAD_CONCURRENCY = 4

type UploadPhase = 'confirm' | 'uploading' | 'done' | 'aborting'

interface FileFailure {
  path: string
  reason: string
}

interface UploadSummary {
  stored: number
  skipped: number
  errored: number
  failures: FileFailure[]
}

export default function ImagingPage({ patientId }: { patientId: number }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [studies, setStudies] = useState<PhrDicomStudy[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [phase, setPhase] = useState<UploadPhase>('confirm')
  const [queuedFiles, setQueuedFiles] = useState<FileWithRelativePath[]>([])
  const [rootName, setRootName] = useState<string | null>(null)
  const [bytesSent, setBytesSent] = useState(0)
  const [filesProcessed, setFilesProcessed] = useState(0)
  const [currentFileName, setCurrentFileName] = useState<string>('')
  const [summary, setSummary] = useState<UploadSummary>({ stored: 0, skipped: 0, errored: 0, failures: [] })

  const controllerRef = useRef<UploadController | null>(null)

  const loadStudies = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [rawStudies, rawPatient] = await Promise.all([
        fetchWrapper.get(`/api/phr/patients/${patientId}/dicom/studies`),
        fetchWrapper.get(`/api/phr/patients/${patientId}`),
      ])
      setStudies(PhrDicomStudiesResponseSchema.parse(rawStudies).studies)
      const p = (rawPatient as { patient?: { can_manage?: boolean } } | null)?.patient
      setCanManage(Boolean(p?.can_manage))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [patientId])

  useEffect(() => {
    void loadStudies()
  }, [loadStudies])

  const totalBytes = useMemo(() => queuedFiles.reduce((sum, file) => sum + file.size, 0), [queuedFiles])
  const totalFiles = queuedFiles.length
  const progressPercent = totalBytes === 0 ? 0 : Math.min(100, Math.round((bytesSent / totalBytes) * 100))

  function onFolderChosen(files: FileList | null): void {
    const accepted = files ? Array.from(files).filter((file) => !isAuxiliaryUploadPath(relativeFilePath(file))) : []
    if (accepted.length === 0) {
      setError('No DICOM-compatible files were found in the chosen folder.')
      if (inputRef.current) {
        inputRef.current.value = ''
      }
      return
    }

    setError(null)
    setQueuedFiles(accepted)
    setRootName(inferUploadRootName(accepted))
    setBytesSent(0)
    setFilesProcessed(0)
    setCurrentFileName('')
    setSummary({ stored: 0, skipped: 0, errored: 0, failures: [] })
    setPhase('confirm')
    setDialogOpen(true)

    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  async function startUpload(): Promise<void> {
    setPhase('uploading')

    try {
      const openResponse = await fetchWrapper.post(`/api/phr/patients/${patientId}/dicom/uploads`, rootName ? { root_name: rootName } : {})
      const { upload } = PhrDicomUploadResponseSchema.parse(openResponse)
      const uploadId = upload.id

      controllerRef.current = new UploadController({
        patientId,
        uploadId,
        files: queuedFiles,
        concurrency: UPLOAD_CONCURRENCY,
        onFileBytesProgress: (bytes) => setBytesSent((prev) => prev + bytes),
        onFileStarted: (name) => setCurrentFileName(name),
        onFileFinished: (outcome) => {
          setFilesProcessed((prev) => prev + 1)
          setSummary((prev) => applyOutcomeToSummary(prev, outcome))
        },
      })

      await controllerRef.current.run()

      if (controllerRef.current.aborted) {
        await fetchWrapper.post(`/api/phr/patients/${patientId}/dicom/uploads/${uploadId}/cancel`, {}).catch(() => {})
      } else {
        await fetchWrapper.post(`/api/phr/patients/${patientId}/dicom/uploads/${uploadId}/finalize`, {})
      }

      setPhase('done')
      await loadStudies()
    } catch (caught) {
      setError(errorMessage(caught))
      setPhase('done')
    } finally {
      controllerRef.current = null
    }
  }

  function cancelUpload(): void {
    if (controllerRef.current && !controllerRef.current.aborted) {
      setPhase('aborting')
      controllerRef.current.abort()
    } else {
      closeDialog()
    }
  }

  function closeDialog(): void {
    setDialogOpen(false)
    setQueuedFiles([])
    setCurrentFileName('')
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <Images className="size-6 text-primary" />
          Imaging
        </h1>
        <div className="flex gap-2">
          {canManage && (
            <Button type="button" size="sm" onClick={() => inputRef.current?.click()}>
              <UploadCloud className="size-4" />
              Upload DICOM
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => void loadStudies()} disabled={busy}>
            <RefreshCcw className="size-4" />
            Refresh
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(event) => onFolderChosen(event.target.files)}
        {...directoryInputAttributes}
      />

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {busy && studies.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!busy && studies.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No imaging studies.
        </div>
      )}

      {studies.length > 0 && (
        <div className="flex flex-col gap-3">
          {studies.map((study) => (
            <div key={study.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="break-words font-medium text-card-foreground">{study.description || 'DICOM Study'}</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {[study.study_date, study.modalities, `${study.series_count} series`, `${study.instance_count} images`].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => openInOhifViewer(patientId, study.id)}>
                  <ExternalLink className="size-4" />
                  Viewer
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => downloadStudyZip(patientId, study.id)}>
                  <Download className="size-4" />
                  ZIP
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && (phase === 'uploading' || phase === 'aborting')) {
            return
          }
          if (!open) {
            closeDialog()
          }
        }}
      >
        <DialogContent showCloseButton={phase !== 'uploading' && phase !== 'aborting'}>
          <DialogHeader>
            <DialogTitle>
              {phase === 'confirm' && 'Upload DICOM folder'}
              {phase === 'uploading' && 'Uploading…'}
              {phase === 'aborting' && 'Cancelling…'}
              {phase === 'done' && (summary.errored > 0 ? 'Upload finished with errors' : 'Upload complete')}
            </DialogTitle>
            <DialogDescription>
              {phase === 'confirm' && `${totalFiles} file${totalFiles === 1 ? '' : 's'} · ${formatBytes(totalBytes)}${rootName ? ` · ${rootName}` : ''}`}
              {(phase === 'uploading' || phase === 'aborting') && `${filesProcessed} of ${totalFiles} files · ${formatBytes(bytesSent)} / ${formatBytes(totalBytes)}`}
              {phase === 'done' && `Stored ${summary.stored} · Skipped ${summary.skipped}${summary.errored > 0 ? ` · Errored ${summary.errored}` : ''}`}
            </DialogDescription>
          </DialogHeader>

          {(phase === 'uploading' || phase === 'aborting') && (
            <div className="flex flex-col gap-2">
              <Progress value={progressPercent} />
              <p className="truncate text-xs text-muted-foreground">
                <Loader2 className="mr-1 inline size-3 animate-spin" />
                {phase === 'aborting' ? 'Stopping in-flight uploads…' : currentFileName || 'Preparing…'}
              </p>
            </div>
          )}

          {phase === 'done' && summary.failures.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-xs">
              <p className="mb-1 flex items-center gap-1 font-medium text-foreground">
                <AlertCircle className="size-3" />
                Failed files
              </p>
              <ul className="space-y-0.5 text-muted-foreground">
                {summary.failures.slice(0, 50).map((failure) => (
                  <li key={`${failure.path}:${failure.reason}`} className="break-words">
                    {failure.path} — {failure.reason}
                  </li>
                ))}
                {summary.failures.length > 50 && (
                  <li className="italic">…and {summary.failures.length - 50} more</li>
                )}
              </ul>
            </div>
          )}

          {phase === 'done' && summary.errored === 0 && summary.stored > 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-primary" />
              Studies are now visible below.
            </p>
          )}

          <DialogFooter>
            {phase === 'confirm' && (
              <>
                <Button type="button" variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void startUpload()}>
                  <UploadCloud className="size-4" />
                  Upload {totalFiles} file{totalFiles === 1 ? '' : 's'}
                </Button>
              </>
            )}
            {phase === 'uploading' && (
              <Button type="button" variant="outline" onClick={cancelUpload}>
                <X className="size-4" />
                Cancel upload
              </Button>
            )}
            {phase === 'aborting' && (
              <Button type="button" variant="outline" disabled>
                <Loader2 className="size-4 animate-spin" />
                Cancelling…
              </Button>
            )}
            {phase === 'done' && (
              <Button type="button" onClick={closeDialog}>
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface FileOutcome {
  stored: boolean
  skippedReason: string | null
  errorMessage: string | null
  relativePath: string
}

interface UploadControllerOptions {
  patientId: number
  uploadId: number
  files: FileWithRelativePath[]
  concurrency: number
  onFileBytesProgress: (deltaBytes: number) => void
  onFileStarted: (name: string) => void
  onFileFinished: (outcome: FileOutcome) => void
}

class UploadController {
  private readonly options: UploadControllerOptions

  private nextIndex = 0

  private readonly activeRequests = new Set<XMLHttpRequest>()

  aborted = false

  constructor(options: UploadControllerOptions) {
    this.options = options
  }

  abort(): void {
    this.aborted = true
    for (const request of this.activeRequests) {
      request.abort()
    }
  }

  async run(): Promise<void> {
    const workerCount = Math.min(this.options.concurrency, this.options.files.length)
    const workers: Promise<void>[] = []
    for (let i = 0; i < workerCount; i++) {
      workers.push(this.runWorker())
    }
    await Promise.all(workers)
  }

  private async runWorker(): Promise<void> {
    while (!this.aborted) {
      const index = this.nextIndex++
      if (index >= this.options.files.length) {
        return
      }
      const file = this.options.files[index]
      if (!file) {
        return
      }
      const outcome = await this.uploadOne(file)
      this.options.onFileFinished(outcome)
    }
  }

  private uploadOne(file: FileWithRelativePath): Promise<FileOutcome> {
    const relativePath = relativeFilePath(file)
    this.options.onFileStarted(relativePath)

    return new Promise<FileOutcome>((resolve) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `/api/phr/patients/${this.options.patientId}/dicom/uploads/${this.options.uploadId}/files`)
      const token = csrfToken()
      if (token) {
        xhr.setRequestHeader('X-CSRF-TOKEN', token)
      }
      xhr.withCredentials = true

      let lastLoaded = 0
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const delta = event.loaded - lastLoaded
          lastLoaded = event.loaded
          this.options.onFileBytesProgress(delta)
        }
      })

      xhr.addEventListener('load', () => {
        this.activeRequests.delete(xhr)
        this.options.onFileBytesProgress(file.size - lastLoaded)

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed = PhrDicomUploadFileResponseSchema.parse(JSON.parse(xhr.responseText))
            resolve({
              stored: parsed.result.stored,
              skippedReason: parsed.result.skipped_reason,
              errorMessage: null,
              relativePath,
            })
          } catch (error) {
            resolve({ stored: false, skippedReason: null, errorMessage: errorMessage(error), relativePath })
          }
        } else {
          resolve({ stored: false, skippedReason: null, errorMessage: extractServerError(xhr), relativePath })
        }
      })

      xhr.addEventListener('error', () => {
        this.activeRequests.delete(xhr)
        resolve({ stored: false, skippedReason: null, errorMessage: 'Network error.', relativePath })
      })

      xhr.addEventListener('abort', () => {
        this.activeRequests.delete(xhr)
        resolve({ stored: false, skippedReason: null, errorMessage: 'Cancelled.', relativePath })
      })

      const formData = new FormData()
      formData.append('file', file)
      formData.append('relative_path', relativePath)

      this.activeRequests.add(xhr)
      xhr.send(formData)
    })
  }
}

function applyOutcomeToSummary(summary: UploadSummary, outcome: FileOutcome): UploadSummary {
  if (outcome.stored) {
    return { ...summary, stored: summary.stored + 1 }
  }
  if (outcome.errorMessage !== null) {
    return {
      ...summary,
      errored: summary.errored + 1,
      failures: [...summary.failures, { path: outcome.relativePath, reason: outcome.errorMessage }],
    }
  }
  return {
    ...summary,
    skipped: summary.skipped + 1,
    failures: outcome.skippedReason && outcome.skippedReason !== 'auxiliary_file' && outcome.skippedReason !== 'duplicate_sop_instance'
      ? [...summary.failures, { path: outcome.relativePath, reason: outcome.skippedReason }]
      : summary.failures,
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function csrfToken(): string | null {
  const meta = document.querySelector('meta[name="csrf-token"]')
  return meta ? meta.getAttribute('content') : null
}

function extractServerError(xhr: XMLHttpRequest): string {
  try {
    const parsed = JSON.parse(xhr.responseText)
    if (parsed && typeof parsed === 'object' && 'message' in parsed) {
      return String(parsed.message)
    }
  } catch {
    // body wasn't JSON, fall through
  }
  return xhr.statusText || `HTTP ${xhr.status}`
}

function relativeFilePath(file: FileWithRelativePath): string {
  return file.webkitRelativePath || file.name
}

function inferUploadRootName(files: FileWithRelativePath[]): string | null {
  const firstFile = files[0]
  if (!firstFile) {
    return null
  }

  const firstPath = relativeFilePath(firstFile)
  const segments = firstPath.split('/').filter(Boolean)

  return segments.length > 1 ? (segments[0] ?? null) : null
}

function isAuxiliaryUploadPath(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/')
  const basename = normalizedPath.split('/').pop()?.toLowerCase() ?? ''

  if (basename === 'dicomdir') {
    return false
  }

  const extension = basename.includes('.') ? basename.split('.').pop() ?? '' : ''
  return [
    'bat',
    'bmp',
    'cmd',
    'com',
    'css',
    'dll',
    'doc',
    'docx',
    'exe',
    'gif',
    'htm',
    'html',
    'ico',
    'inf',
    'ini',
    'jpg',
    'jpeg',
    'js',
    'lnk',
    'msi',
    'pdf',
    'png',
    'rtf',
    'txt',
    'url',
    'xml',
  ].includes(extension)
}

function downloadStudyZip(patientId: number, studyId: number): void {
  window.open(`/api/phr/patients/${patientId}/dicom/studies/${studyId}/download`, '_blank', 'noopener,noreferrer')
}

function openInOhifViewer(patientId: number, studyId: number): void {
  const manifestUrl = `/api/phr/patients/${patientId}/dicom/studies/${studyId}/viewer-json`
  const viewerUrl = `/ohif/viewer?datasources=dicomjson&url=${encodeURIComponent(manifestUrl)}`
  window.open(viewerUrl, '_blank', 'noopener,noreferrer')
}
