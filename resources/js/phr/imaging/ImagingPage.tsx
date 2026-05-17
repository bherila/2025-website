import { Download, ExternalLink, Images, RefreshCcw, UploadCloud } from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { fetchWrapper } from '@/fetchWrapper'
import PatientList from '@/phr/patients/PatientList'
import { usePhrPatients } from '@/phr/patients/usePhrPatients'
import PhrShell from '@/phr/PhrShell'
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

export default function ImagingPage() {
  const { patients, selectedPatientId, selectedPatient, busy, error, setSelectedPatientId } = usePhrPatients()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [recordsBusy, setRecordsBusy] = useState(false)
  const [recordsError, setRecordsError] = useState<string | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<FileWithRelativePath[]>([])
  const [uploadResult, setUploadResult] = useState<PhrDicomUpload | null>(null)
  const [studies, setStudies] = useState<PhrDicomStudy[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)

  const acceptedFiles = useMemo(
    () => selectedFiles.filter((file) => !isAuxiliaryUploadPath(relativeFilePath(file))),
    [selectedFiles],
  )

  const clientSkippedCount = selectedFiles.length - acceptedFiles.length

  async function loadStudies(patientId: number): Promise<void> {
    setRecordsBusy(true)
    setRecordsError(null)

    try {
      const rawStudies = await fetchWrapper.get(`/api/phr/patients/${patientId}/dicom/studies`)
      setStudies(PhrDicomStudiesResponseSchema.parse(rawStudies).studies)
    } catch (caught) {
      setRecordsError(errorMessage(caught))
    } finally {
      setRecordsBusy(false)
    }
  }

  useEffect(() => {
    if (selectedPatientId === null) {
      setStudies([])
      return
    }

    void loadStudies(selectedPatientId)
  }, [selectedPatientId])

  function selectFiles(files: FileList | null): void {
    setUploadError(null)
    setUploadResult(null)
    setSelectedFiles(files ? Array.from(files) as FileWithRelativePath[] : [])
  }

  async function upload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (!selectedPatient || acceptedFiles.length === 0) {
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

    setRecordsBusy(true)
    setUploadError(null)

    try {
      const rawResponse: unknown = await fetchWrapper.post(`/api/phr/patients/${selectedPatient.id}/dicom/uploads`, formData)
      const response = PhrDicomUploadResponseSchema.parse(rawResponse)
      setUploadResult(response.upload)
      setSelectedFiles([])
      if (inputRef.current) {
        inputRef.current.value = ''
      }
      await loadStudies(selectedPatient.id)
    } catch (caught) {
      setUploadError(errorMessage(caught))
    } finally {
      setRecordsBusy(false)
    }
  }

  return (
    <PhrShell activeTab="imaging" patientId={selectedPatientId} busy={busy || recordsBusy} error={error ?? recordsError}>
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <PatientList patients={patients} selectedPatientId={selectedPatientId} onSelect={setSelectedPatientId} />

        <section className="rounded-md border border-border bg-card p-4">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Images className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-card-foreground">Imaging</h2>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={!selectedPatientId} onClick={() => selectedPatientId !== null && void loadStudies(selectedPatientId)}>
              <RefreshCcw className="size-4" />
              Refresh
            </Button>
          </div>

          {!selectedPatient ? <p className="mb-4 text-sm text-muted-foreground">Select a profile to view imaging studies.</p> : null}

          {selectedPatient?.can_manage ? (
            <form className="mb-4 grid gap-3 rounded-md border border-border bg-background p-3" onSubmit={(event) => void upload(event)}>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                multiple
                onChange={(event) => selectFiles(event.target.files)}
                {...directoryInputAttributes}
              />
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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
                  <Button type="submit" size="sm" disabled={acceptedFiles.length === 0}>
                    <UploadCloud className="size-4" />
                    Upload
                  </Button>
                </div>
              </div>
              {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
              {uploadResult ? (
                <p className="text-sm text-muted-foreground">
                  Stored {uploadResult.stored_files} of {uploadResult.total_files} file{uploadResult.total_files === 1 ? '' : 's'}.
                </p>
              ) : null}
            </form>
          ) : null}

          {studies.length === 0 ? (
            <p className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">No imaging studies.</p>
          ) : (
            <div className="grid gap-2">
              {studies.map((study) => (
                <div key={study.id} className="rounded-md border border-border bg-background p-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-foreground">{study.description || 'DICOM Study'}</p>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {[study.study_date, study.modalities, `${study.series_count} series`, `${study.instance_count} images`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => openInOhifViewer(selectedPatientId ?? 0, study.id)}>
                        <ExternalLink className="size-4" />
                        Viewer
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => downloadStudyZip(selectedPatientId ?? 0, study.id)}>
                        <Download className="size-4" />
                        ZIP
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </PhrShell>
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
