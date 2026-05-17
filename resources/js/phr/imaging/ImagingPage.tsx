import { Download, ExternalLink, Images, RefreshCcw, UploadCloud } from 'lucide-react'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { fetchWrapper } from '@/fetchWrapper'
import { errorMessage } from '@/phr/shared'
import {
  PhrDicomStudiesResponseSchema,
  type PhrDicomStudy,
  type PhrDicomUpload,
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

export default function ImagingPage({ patientId }: { patientId: number }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<FileWithRelativePath[]>([])
  const [uploadResult, setUploadResult] = useState<PhrDicomUpload | null>(null)
  const [studies, setStudies] = useState<PhrDicomStudy[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)

  const acceptedFiles = useMemo(
    () => selectedFiles.filter((file) => !isAuxiliaryUploadPath(relativeFilePath(file))),
    [selectedFiles],
  )

  const clientSkippedCount = selectedFiles.length - acceptedFiles.length

  const loadStudies = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [rawStudies, rawPatient] = await Promise.all([
        fetchWrapper.get(`/api/phr/patients/${patientId}/dicom/studies`),
        fetchWrapper.get(`/api/phr/patients/${patientId}`),
      ])
      setStudies(PhrDicomStudiesResponseSchema.parse(rawStudies).studies)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (rawPatient as any)?.patient
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

  function selectFiles(files: FileList | null): void {
    setUploadError(null)
    setUploadResult(null)
    setSelectedFiles(files ? Array.from(files) as FileWithRelativePath[] : [])
  }

  async function upload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (acceptedFiles.length === 0) {
      setUploadError('Select a DICOM directory or files to upload.')
      return
    }

    const formData = new FormData()
    const rootName = inferUploadRootName(acceptedFiles)
    if (rootName) {
      formData.append('root_name', rootName)
    }

    acceptedFiles.forEach((file) => {
      formData.append('files[]', file)
      formData.append('relative_paths[]', relativeFilePath(file))
    })

    setBusy(true)
    setUploadError(null)

    try {
      const rawResponse: unknown = await fetchWrapper.post(`/api/phr/patients/${patientId}/dicom/uploads`, formData)
      const response = PhrDicomUploadResponseSchema.parse(rawResponse)
      setUploadResult(response.upload)
      setSelectedFiles([])
      if (inputRef.current) {
        inputRef.current.value = ''
      }
      await loadStudies()
    } catch (caught) {
      setUploadError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <Images className="size-6 text-primary" />
          Imaging
        </h1>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadStudies()} disabled={busy}>
          <RefreshCcw className="size-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {canManage && (
        <form className="mb-6 rounded-lg border border-border bg-card p-4" onSubmit={(event) => void upload(event)}>
          <h2 className="mb-3 text-sm font-semibold text-card-foreground">Upload DICOM</h2>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple
            onChange={(event) => selectFiles(event.target.files)}
            {...directoryInputAttributes}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <p className="font-medium text-foreground">
                {selectedFiles.length === 0 ? 'No imaging files selected' : `${acceptedFiles.length} DICOM candidate${acceptedFiles.length === 1 ? '' : 's'} selected`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {clientSkippedCount > 0 ? `${clientSkippedCount} auxiliary file${clientSkippedCount === 1 ? '' : 's'} skipped before upload` : 'Directory uploads preserve DICOM relative paths'}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                <UploadCloud className="size-4" />
                Choose Folder
              </Button>
              <Button type="submit" size="sm" disabled={acceptedFiles.length === 0 || busy}>
                <UploadCloud className="size-4" />
                Upload
              </Button>
            </div>
          </div>
          {uploadError && <p className="mt-2 text-sm text-destructive">{uploadError}</p>}
          {uploadResult && (
            <p className="mt-2 text-sm text-muted-foreground">
              Stored {uploadResult.stored_files} of {uploadResult.total_files} file{uploadResult.total_files === 1 ? '' : 's'}.
            </p>
          )}
        </form>
      )}

      {busy && <p className="text-sm text-muted-foreground">Loading…</p>}

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
    </div>
  )
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
