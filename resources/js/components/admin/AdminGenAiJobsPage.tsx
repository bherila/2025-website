import { Check, Copy } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'

import Container from '@/components/container'
import MainTitle from '@/components/MainTitle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import type { GenAiImportJobData, GenAiImportResultData } from '@/genai-processor/types'

interface AdminGenAiJob extends GenAiImportJobData {
  user?: {
    id: number
    name: string
    email: string
  }
}

interface PaginatedResponse {
  data: AdminGenAiJob[]
  current_page: number
  last_page: number
  per_page: number
  total: number
  from: number | null
  to: number | null
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  processing: 'default',
  parsed: 'default',
  imported: 'default',
  failed: 'destructive',
  queued_tomorrow: 'secondary',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  parsed: 'Parsed',
  imported: 'Imported',
  failed: 'Failed',
  queued_tomorrow: 'Queued Tomorrow',
}

const JOB_TYPE_LABELS: Record<string, string> = {
  finance_transactions: 'Finance Transactions',
  finance_payslip: 'Payslip',
  utility_bill: 'Utility Bill',
  tax_document: 'Tax Document',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleString()
}

function CopyToClipboard({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
      onClick={handleCopy}
    >
      {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
      {copied ? 'Copied' : (label || 'Copy')}
    </Button>
  )
}

interface JobDetailModalProps {
  job: AdminGenAiJob | null
  open: boolean
  onClose: () => void
}

function JobDetailModal({ job, open, onClose }: JobDetailModalProps) {
  if (!job) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Job #{job.id} — {job.original_filename}
            <Badge variant={STATUS_COLORS[job.status] ?? 'outline'}>
              {STATUS_LABELS[job.status] ?? job.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Meta info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-semibold text-muted-foreground">User</div>
              <div>
                {job.user ? `${job.user.name} (${job.user.email})` : `User #${job.user_id}`}
              </div>
            </div>
            <div>
              <div className="font-semibold text-muted-foreground">Job Type</div>
              <div>{JOB_TYPE_LABELS[job.job_type] ?? job.job_type}</div>
            </div>
            <div>
              <div className="font-semibold text-muted-foreground">Created</div>
              <div>{formatDate(job.created_at)}</div>
            </div>
            <div>
              <div className="font-semibold text-muted-foreground">Parsed At</div>
              <div>{formatDate(job.parsed_at)}</div>
            </div>
            <div>
              <div className="font-semibold text-muted-foreground">File Size</div>
              <div>{formatBytes(job.file_size_bytes)}</div>
            </div>
            <div>
              <div className="font-semibold text-muted-foreground">Retry Count</div>
              <div>{job.retry_count}</div>
            </div>
            <div>
              <div className="font-semibold text-muted-foreground">S3 Path</div>
              <div className="font-mono text-xs break-all">{job.s3_path}</div>
            </div>
            <div>
              <div className="font-semibold text-muted-foreground">File Hash (ETag)</div>
              <div className="font-mono text-xs break-all">{job.file_hash}</div>
            </div>
          </div>

          {/* Error message */}
          {job.error_message && (
            <div>
              <div className="font-semibold text-muted-foreground mb-1">Error</div>
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded p-3 text-sm text-red-700 dark:text-red-300 font-mono">
                {job.error_message}
              </div>
            </div>
          )}

          {/* Context JSON */}
          {job.context_json && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold text-muted-foreground">Context (Request Input)</div>
                <CopyToClipboard text={JSON.stringify(JSON.parse(job.context_json), null, 2)} />
              </div>
              <pre className="bg-gray-50 dark:bg-gray-900 border rounded p-3 text-xs overflow-auto max-h-40">
                {JSON.stringify(JSON.parse(job.context_json), null, 2)}
              </pre>
            </div>
          )}

          {/* Raw LLM Response */}
          {job.raw_response && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold text-muted-foreground">Raw LLM Response</div>
                <CopyToClipboard text={job.raw_response} />
              </div>
              <pre className="bg-gray-50 dark:bg-gray-900 border rounded p-3 text-xs overflow-auto max-h-64 font-mono">
                {job.raw_response}
              </pre>
            </div>
          )}

          {/* Results (Gemini responses) */}
          {job.results && job.results.length > 0 ? (
            <div>
              <div className="font-semibold text-muted-foreground mb-2">
                Results ({job.results.length})
              </div>
              <div className="space-y-2">
                {job.results.map((result: GenAiImportResultData) => (
                  <div key={result.id} className="border rounded">
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-900 text-xs">
                      <span>Result #{result.result_index + 1}</span>
                      <div className="flex items-center gap-2">
                        <CopyToClipboard text={JSON.stringify(JSON.parse(result.result_json), null, 2)} />
                        <Badge variant="outline">{result.status}</Badge>
                      </div>
                    </div>
                    <pre className="p-3 text-xs overflow-auto max-h-64 font-mono">
                      {JSON.stringify(JSON.parse(result.result_json), null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No results yet.</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminGenAiJobsPage() {
  const [paginatedData, setPaginatedData] = useState<PaginatedResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [selectedJob, setSelectedJob] = useState<AdminGenAiJob | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)

  const fetchJobs = useCallback(async (pageNum: number) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchWrapper.get(`/api/admin/genai-jobs?page=${pageNum}&per_page=25`)
      setPaginatedData(data)
    } catch (err) {
      setError('Failed to load GenAI jobs. Ensure you have admin access.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs(page)
  }, [page, fetchJobs])

  const handleViewDetails = (job: AdminGenAiJob) => {
    setSelectedJob(job)
    setDetailModalOpen(true)
  }

  const handleCloseModal = () => {
    setDetailModalOpen(false)
    setSelectedJob(null)
  }

  return (
    <Container>
      <MainTitle>Admin: GenAI Jobs</MainTitle>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>All GenAI Import Jobs</span>
            {paginatedData && (
              <span className="text-sm font-normal text-muted-foreground">
                {paginatedData.total} total
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-red-600 mb-4">{error}</div>
          )}

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Results</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData?.data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No GenAI jobs found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedData?.data.map((job) => (
                      <TableRow key={job.id} className="hover:bg-muted/50">
                        <TableCell className="font-mono text-xs">{job.id}</TableCell>
                        <TableCell className="text-sm">
                          {job.user ? (
                            <div>
                              <div className="font-medium">{job.user.name}</div>
                              <div className="text-xs text-muted-foreground">{job.user.email}</div>
                            </div>
                          ) : (
                            `User #${job.user_id}`
                          )}
                        </TableCell>
                        <TableCell className="text-sm max-w-[160px] truncate" title={job.original_filename}>
                          {job.original_filename}
                          <div className="text-xs text-muted-foreground">{formatBytes(job.file_size_bytes)}</div>
                        </TableCell>
                        <TableCell className="text-sm">{JOB_TYPE_LABELS[job.job_type] ?? job.job_type}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_COLORS[job.status] ?? 'outline'}>
                            {STATUS_LABELS[job.status] ?? job.status}
                          </Badge>
                          {job.retry_count > 0 && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {job.retry_count} {job.retry_count === 1 ? 'retry' : 'retries'}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {job.results?.length ?? 0}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(job.created_at)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetails(job)}
                          >
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {paginatedData && paginatedData.last_page > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {paginatedData.from ?? 0}–{paginatedData.to ?? 0} of {paginatedData.total}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={paginatedData.current_page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm self-center px-2">
                      Page {paginatedData.current_page} / {paginatedData.last_page}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={paginatedData.current_page >= paginatedData.last_page}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <JobDetailModal job={selectedJob} open={detailModalOpen} onClose={handleCloseModal} />
    </Container>
  )
}
