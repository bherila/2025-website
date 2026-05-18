import { Check, FileText, Loader2, RefreshCw, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchWrapper } from '@/fetchWrapper'
import type { GenAiJobType } from '@/genai-processor/types'
import { useGenAiFileUpload } from '@/genai-processor/useGenAiFileUpload'
import { useGenAiJobPolling } from '@/genai-processor/useGenAiJobPolling'
import { errorMessage } from '@/phr/shared'
import { type PhrDocument, PhrDocumentsResponseSchema } from '@/phr/types'

const PHR_JOB_TYPES: Array<{ value: GenAiJobType; label: string }> = [
  { value: 'phr_lab_result', label: 'Labs' },
  { value: 'phr_vital', label: 'Vitals' },
  { value: 'phr_office_visit', label: 'Office Visit' },
  { value: 'phr_medication', label: 'Medications' },
  { value: 'phr_immunization', label: 'Immunizations' },
  { value: 'phr_problem_list', label: 'Problem List' },
  { value: 'phr_procedure', label: 'Procedures' },
  { value: 'phr_allergy', label: 'Allergies' },
  { value: 'phr_document', label: 'Document Summary' },
]

function initialJobTypeFromQuery(): GenAiJobType {
  const value = new URLSearchParams(window.location.search).get('job_type')
  const option = PHR_JOB_TYPES.find((type) => type.value === value)

  return option?.value ?? 'phr_document'
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export default function DocumentsPage({ patientId }: { patientId: number }) {
  const [documents, setDocuments] = useState<PhrDocument[]>([])
  const [jobType, setJobType] = useState<GenAiJobType>(() => initialJobTypeFromQuery())
  const [file, setFile] = useState<File | null>(null)
  const [jobId, setJobId] = useState<number | null>(null)
  const [editors, setEditors] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [acceptingId, setAcceptingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const uploadOptions = useMemo(() => ({
    jobType,
    context: { patient_id: patientId },
  }), [jobType, patientId])

  const { upload, uploading, error: uploadError } = useGenAiFileUpload(uploadOptions)
  const { status, results, error: pollError, estimatedWait, refetch } = useGenAiJobPolling(jobId)

  const loadDocuments = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const raw = await fetchWrapper.get(`/api/phr/patients/${patientId}/documents`)
      setDocuments(PhrDocumentsResponseSchema.parse(raw).documents)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [patientId])

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  useEffect(() => {
    setEditors((current) => {
      const next = { ...current }
      for (const result of results) {
        if (next[result.id] === undefined) {
          next[result.id] = prettyJson(result.result_json)
        }
      }
      return next
    })
  }, [results])

  async function startUpload(): Promise<void> {
    if (!file) {
      setError('Choose a file first.')
      return
    }

    setError(null)
    const response = await upload(file)
    setJobId(response.jobId)
  }

  async function acceptResult(resultId: number): Promise<void> {
    if (jobId === null) return
    const raw = editors[resultId] ?? '{}'
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    } catch {
      setError('Result JSON is invalid.')
      return
    }

    setAcceptingId(resultId)
    setError(null)
    try {
      await fetchWrapper.post(`/api/phr/genai/jobs/${jobId}/results/${resultId}/accept`, { payload })
      refetch()
      await loadDocuments()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setAcceptingId(null)
    }
  }

  const activeError = error ?? uploadError ?? pollError

  return (
    <div className="grid gap-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <FileText className="size-6 text-primary" />
              Documents
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Upload a PDF, image, HTML, or text file for GenAI review.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadDocuments()} disabled={busy}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
          <label className="grid gap-1 text-sm font-medium text-foreground">
            File
            <Input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.heic,.html,.htm,.txt"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-foreground">
            Import Type
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={jobType}
              onChange={(event) => setJobType(event.target.value as GenAiJobType)}
            >
              {PHR_JOB_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>
          <Button onClick={() => void startUpload()} disabled={uploading || !file}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Process
          </Button>
        </div>

        {jobId !== null && (
          <div className="mt-4 rounded-md border border-border bg-background p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">Job {jobId}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{status ?? 'loading'}</span>
              {estimatedWait && <span className="text-muted-foreground">{estimatedWait}</span>}
            </div>
            {results.length > 0 && (
              <div className="mt-3 grid gap-3">
                {results.map((result) => (
                  <div key={result.id} className="rounded-md border border-border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium uppercase text-muted-foreground">Result {result.result_index + 1}</span>
                      <span className="text-xs text-muted-foreground">{result.status}</span>
                    </div>
                    <textarea
                      className="min-h-48 w-full rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground"
                      value={editors[result.id] ?? prettyJson(result.result_json)}
                      onChange={(event) => setEditors((current) => ({ ...current, [result.id]: event.target.value }))}
                      disabled={result.status === 'imported'}
                    />
                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => void acceptResult(result.id)}
                        disabled={result.status === 'imported' || acceptingId === result.id}
                      >
                        {acceptingId === result.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                        Import
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeError && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {activeError}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-[minmax(0,1fr)_150px_160px_130px] gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium uppercase text-muted-foreground max-lg:hidden">
          <span>Document</span>
          <span>Type</span>
          <span>Source</span>
          <span>Added</span>
        </div>
        {busy ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">No documents imported yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {documents.map((document) => (
              <div key={document.id} className="grid gap-2 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_150px_160px_130px] lg:items-center">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {document.download_url ? (
                      <a href={document.download_url} className="hover:underline">
                        {document.title ?? document.original_filename ?? `Document ${document.id}`}
                      </a>
                    ) : (
                      document.title ?? document.original_filename ?? `Document ${document.id}`
                    )}
                  </div>
                  {document.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{document.summary}</p>}
                </div>
                <div className="text-sm text-muted-foreground">{document.document_type}</div>
                <div className="text-sm text-muted-foreground">{document.source ?? 'manual'}</div>
                <div className="text-sm text-muted-foreground">{document.created_at?.slice(0, 10) ?? ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
