'use client'

import { FileText, RefreshCw, Upload } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { fetchWrapper } from '@/fetchWrapper'

import DocumentImportModal from './DocumentImportModal'

interface FinanceDocumentAccount {
  id: number
  account_id: number | null
  form_type: string | null
  tax_year: number | null
  account_section_label: string | null
  payload_kind: string | null
  account?: {
    acct_id: number
    acct_name: string
    acct_number?: string | null
  } | null
}

interface FinanceDocument {
  id: number
  document_kind: string
  tax_year: number | null
  period_start: string | null
  period_end: string | null
  original_filename: string | null
  mime_type: string | null
  genai_status: string | null
  created_at: string
  accounts?: FinanceDocumentAccount[]
  tax_document?: {
    id: number
    form_type: string
    tax_year: number
    genai_status: string | null
  } | null
}

interface DocumentRowProps {
  finDocument: FinanceDocument
}

interface KindFilter {
  value: string
  label: string
}

const KIND_FILTERS: KindFilter[] = [
  { value: 'all', label: 'All' },
  { value: 'tax_form', label: 'Tax Forms' },
  { value: 'statement', label: 'Statements' },
  { value: 'csv_import', label: 'CSV' },
  { value: 'json_import', label: 'JSON' },
  { value: 'toon_import', label: 'TOON' },
]

const KIND_LABELS: Record<string, string> = {
  tax_form: 'Tax form',
  statement: 'Statement',
  csv_import: 'CSV import',
  json_import: 'JSON import',
  toon_import: 'TOON import',
  manual: 'Manual',
}

export default function FinanceDocumentsPage() {
  const [documents, setDocuments] = useState<FinanceDocument[]>([])
  const [activeKind, setActiveKind] = useState('all')
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDocuments = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const query = activeKind === 'all' ? '' : `?document_kind=${encodeURIComponent(activeKind)}`
      const response = await fetchWrapper.get(`/api/finance/documents${query}`) as FinanceDocument[]
      setDocuments(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setIsLoading(false)
    }
  }, [activeKind])

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">Documents</h1>
          <p className="text-sm text-muted-foreground">Tax forms, statements, and imported account files</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void loadDocuments()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setIsImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Import
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {KIND_FILTERS.map((filter) => (
          <Button
            key={filter.value}
            variant={activeKind === filter.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveKind(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-md border bg-background">
        <div className="grid grid-cols-[minmax(0,1.5fr)_160px_180px_140px] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium uppercase text-muted-foreground max-lg:hidden">
          <span>Document</span>
          <span>Kind</span>
          <span>Accounts</span>
          <span>Status</span>
        </div>

        {isLoading ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">No documents found</div>
        ) : (
          <div className="divide-y">
            {documents.map((finDocument) => (
              <DocumentRow key={finDocument.id} finDocument={finDocument} />
            ))}
          </div>
        )}
      </div>
      <DocumentImportModal
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImported={() => void loadDocuments()}
      />
    </main>
  )
}

function DocumentRow({ finDocument }: DocumentRowProps) {
  const accountLabels = (finDocument.accounts ?? [])
    .map((link) => link.account?.acct_name ?? link.account_section_label)
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')

  return (
    <div className="grid grid-cols-1 gap-2 px-3 py-3 lg:grid-cols-[minmax(0,1.5fr)_160px_180px_140px] lg:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/40">
          <FileText className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {finDocument.original_filename ?? `Document ${finDocument.id}`}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {finDocument.tax_year && <span>{finDocument.tax_year}</span>}
            {finDocument.period_end && <span>{finDocument.period_start ? `${finDocument.period_start} to ${finDocument.period_end}` : finDocument.period_end}</span>}
          </div>
        </div>
      </div>

      <div>
        <Badge variant="secondary">{KIND_LABELS[finDocument.document_kind] ?? finDocument.document_kind}</Badge>
      </div>

      <div className="min-w-0 text-sm text-muted-foreground">
        {accountLabels.length > 0 ? accountLabels.slice(0, 2).join(', ') : 'Unassigned'}
        {accountLabels.length > 2 && ` +${accountLabels.length - 2}`}
      </div>

      <div className="text-sm text-muted-foreground">
        {finDocument.genai_status ?? finDocument.tax_document?.genai_status ?? 'ready'}
      </div>
    </div>
  )
}
