'use client'

import { RefreshCw, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { fetchWrapper } from '@/fetchWrapper'

import DocumentImportModal from './DocumentImportModal'
import DocumentDetailDrawer from './documents/DocumentDetailDrawer'
import DocumentFilters from './documents/DocumentFilters'
import DocumentSearchBar from './documents/DocumentSearchBar'
import DocumentsTable from './documents/DocumentsTable'
import {
  DEFAULT_DOCUMENT_FILTERS,
  type DocumentFilterState,
  type FinanceDocument,
  type PaginatedResponse,
} from './documents/types'

function getInitialParam(key: string): string {
  return new URLSearchParams(window.location.search).get(key) ?? ''
}

function setUrlParam(key: string, value: string | null) {
  const params = new URLSearchParams(window.location.search)
  if (value === null || value === '' || value === 'all') {
    params.delete(key)
  } else {
    params.set(key, value)
  }
  const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname
  window.history.replaceState({}, '', newUrl)
}

function getInitialFilters(): DocumentFilterState {
  const params = new URLSearchParams(window.location.search)

  return Object.fromEntries(
    Object.entries(DEFAULT_DOCUMENT_FILTERS).map(([key, defaultValue]) => [
      key,
      params.get(key) ?? defaultValue,
    ]),
  ) as DocumentFilterState
}

export default function FinanceDocumentsPage() {
  const [documents, setDocuments] = useState<FinanceDocument[]>([])
  const [activeKind, setActiveKind] = useState(() => getInitialParam('document_kind') || 'all')
  const [searchQuery, setSearchQuery] = useState(() => getInitialParam('q'))
  const [filters, setFilters] = useState<DocumentFilterState>(getInitialFilters)
  const [currentPage, setCurrentPage] = useState(() => Number(getInitialParam('page') || '1'))
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<FinanceDocument | null>(null)
  const initialDocRef = useRef(getInitialParam('doc'))

  // Initialize drawer from URL on first load
  useEffect(() => {
    const docId = initialDocRef.current
    if (docId) {
      const id = parseInt(docId, 10)
      if (!isNaN(id)) {
        setSelectedDoc({ id } as FinanceDocument)
      }
    }
  }, [])

  const loadDocuments = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (activeKind !== 'all') params.set('document_kind', activeKind)
      if (searchQuery.trim()) params.set('q', searchQuery.trim())
      Object.entries(filters).forEach(([key, value]) => {
        const defaultValue = DEFAULT_DOCUMENT_FILTERS[key as keyof DocumentFilterState]
        if (value !== '' && value !== defaultValue) {
          params.set(key, value)
        }
      })
      if (currentPage > 1) params.set('page', String(currentPage))
      params.set('per_page', '50')

      const queryStr = params.toString() ? `?${params.toString()}` : ''
      const response = (await fetchWrapper.get(`/api/finance/documents${queryStr}`)) as PaginatedResponse<FinanceDocument>

      setDocuments(response.data ?? [])
      setTotalPages(response.meta?.last_page ?? 1)
      setTotal(response.meta?.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setIsLoading(false)
    }
  }, [activeKind, searchQuery, filters, currentPage])

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  // Sync URL params on state changes
  useEffect(() => {
    setUrlParam('document_kind', activeKind === 'all' ? null : activeKind)
    setUrlParam('q', searchQuery || null)
    Object.entries(filters).forEach(([key, value]) => {
      const defaultValue = DEFAULT_DOCUMENT_FILTERS[key as keyof DocumentFilterState]
      setUrlParam(key, value === defaultValue ? null : value)
    })
    setUrlParam('page', currentPage > 1 ? String(currentPage) : null)
  }, [activeKind, searchQuery, filters, currentPage])

  const handleKindChange = (kind: string) => {
    setActiveKind(kind)
    setCurrentPage(1)
  }

  const handleSearch = (q: string) => {
    setSearchQuery(q)
    setCurrentPage(1)
  }

  const handleFilterChange = (key: keyof DocumentFilterState, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setCurrentPage(1)
  }

  const handleClearFilters = () => {
    setActiveKind('all')
    setFilters(DEFAULT_DOCUMENT_FILTERS)
    setCurrentPage(1)
  }

  const handleRowClick = (doc: FinanceDocument) => {
    setSelectedDoc(doc)
    setUrlParam('doc', String(doc.id))
  }

  const handleDrawerClose = () => {
    setSelectedDoc(null)
    setUrlParam('doc', null)
  }

  const handleDownload = async (doc: FinanceDocument) => {
    try {
      const result = (await fetchWrapper.get(`/api/finance/documents/${doc.id}/download`)) as {
        download_url: string
        filename: string
      }
      window.open(result.download_url, '_blank')
    } catch {
      // Silently fail — could add toast later
    }
  }

  const handleView = async (doc: FinanceDocument) => {
    try {
      const result = (await fetchWrapper.get(`/api/finance/documents/${doc.id}/download`)) as {
        view_url: string
        filename: string
      }
      window.open(result.view_url, '_blank')
    } catch {
      // Silently fail
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Tax forms, statements, and imported account files
            {total > 0 && <span className="ml-1">({total})</span>}
          </p>
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <DocumentSearchBar value={searchQuery} onChange={handleSearch} />
        </div>
      </div>

      <DocumentFilters
        activeKind={activeKind}
        filters={filters}
        onKindChange={handleKindChange}
        onFilterChange={handleFilterChange}
        onClear={handleClearFilters}
      />

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <DocumentsTable
        documents={documents}
        isLoading={isLoading}
        onRowClick={handleRowClick}
        onView={(doc) => void handleView(doc)}
        onDownload={(doc) => void handleDownload(doc)}
        onDelete={(doc) => {
          setSelectedDoc(doc)
          setUrlParam('doc', String(doc.id))
        }}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <DocumentImportModal
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImported={() => void loadDocuments()}
      />

      {selectedDoc && (
        <DocumentDetailDrawer
          document={selectedDoc}
          onClose={handleDrawerClose}
          onDeleted={() => {
            handleDrawerClose()
            void loadDocuments()
          }}
        />
      )}
    </main>
  )
}
