import { AlertTriangle, CheckCircle, ExternalLink, Filter } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'

import Container from '@/components/container'
import MainTitle from '@/components/MainTitle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'

interface NormalizationWarning {
  code: string
  path?: string
  message?: string
  original_key?: string
  canonical_key?: string
}

interface ReviewItem {
  item_type: 'document' | 'link'
  document_id: number
  link_id: number | null
  form_type: string
  tax_year: number
  original_filename: string | null
  account_id: number | null
  account_name: string | null
  ai_identifier: string | null
  ai_account_name: string | null
  employment_entity_name: string | null
  warnings: NormalizationWarning[]
  is_reviewed: boolean
  parsed_data_needs_review: boolean
  review_url: string
  created_at: string | null
  updated_at: string | null
}

const WARNING_CODE_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  canonicalized_alias: 'secondary',
  unsupported_field: 'destructive',
  ignored_field: 'outline',
}

function WarningBadge({ code }: { code: string }) {
  const variant = WARNING_CODE_COLORS[code] ?? 'outline'
  const label =
    code === 'canonicalized_alias'
      ? 'Alias'
      : code === 'unsupported_field'
        ? 'Unsupported'
        : code === 'ignored_field'
          ? 'Ignored'
          : code
  return <Badge variant={variant}>{label}</Badge>
}

interface WarningListProps {
  warnings: NormalizationWarning[]
}

function WarningList({ warnings }: WarningListProps) {
  if (!warnings || warnings.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>
  }
  return (
    <div className="space-y-1">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-1.5 text-xs">
          <WarningBadge code={w.code} />
          <span className="font-mono text-muted-foreground">{w.path ?? w.original_key ?? ''}</span>
          {w.canonical_key && (
            <span className="text-muted-foreground">→ {w.canonical_key}</span>
          )}
          {w.message && (
            <span className="text-muted-foreground">{w.message}</span>
          )}
        </div>
      ))}
    </div>
  )
}

interface AcknowledgeButtonProps {
  item: ReviewItem
  onAcknowledged: (item: ReviewItem) => void
}

function AcknowledgeButton({ item, onAcknowledged }: AcknowledgeButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleAcknowledge = async () => {
    if (loading) return
    if (!confirm('Clear the review flag for this item? This removes the warning list.')) return

    setLoading(true)
    try {
      await fetchWrapper.post('/api/admin/tax-normalization-review/acknowledge', {
        type: item.item_type,
        document_id: item.item_type === 'document' ? item.document_id : undefined,
        link_id: item.item_type === 'link' ? item.link_id : undefined,
      })
      onAcknowledged(item)
    } catch (err) {
      alert('Failed to acknowledge item')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleAcknowledge} disabled={loading}>
      <CheckCircle className="h-3.5 w-3.5 mr-1" />
      {loading ? 'Clearing…' : 'Acknowledge'}
    </Button>
  )
}

export default function AdminTaxNormalizationPage() {
  const [items, setItems] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterFormType, setFilterFormType] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterWarningCode, setFilterWarningCode] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'document' | 'link'>('all')

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filterFormType.trim()) params.set('form_type', filterFormType.trim())
      if (filterYear.trim()) params.set('year', filterYear.trim())
      if (filterWarningCode.trim()) params.set('warning_code', filterWarningCode.trim())
      if (filterType !== 'all') params.set('type', filterType)

      const qs = params.toString() ? `?${params.toString()}` : ''
      const data: ReviewItem[] = await fetchWrapper.get(`/api/admin/tax-normalization-review${qs}`)
      setItems(data)
    } catch (err) {
      setError('Failed to load review items. Ensure you have admin access.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [filterFormType, filterYear, filterWarningCode, filterType])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const handleAcknowledged = (item: ReviewItem) => {
    setItems((prev) =>
      prev.filter((i) => {
        if (item.item_type === 'document') return !(i.item_type === 'document' && i.document_id === item.document_id)
        return !(i.item_type === 'link' && i.link_id === item.link_id)
      }),
    )
  }

  const accountLabel = (item: ReviewItem) => {
    if (item.employment_entity_name) return item.employment_entity_name
    if (item.account_name) return item.account_name
    if (item.ai_account_name) return item.ai_account_name
    if (item.ai_identifier) return item.ai_identifier
    if (item.account_id) return `#${item.account_id}`
    return '—'
  }

  return (
    <Container>
      <MainTitle>Admin: Tax Normalization Review</MainTitle>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground">Form Type</label>
              <Input
                placeholder="e.g. 1099_div"
                value={filterFormType}
                onChange={(e) => setFilterFormType(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[100px]">
              <label className="text-xs font-medium text-muted-foreground">Tax Year</label>
              <Input
                placeholder="e.g. 2024"
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground">Warning Code</label>
              <Input
                placeholder="e.g. unsupported_field"
                value={filterWarningCode}
                onChange={(e) => setFilterWarningCode(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-xs font-medium text-muted-foreground">Item Type</label>
              <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="document">Documents</SelectItem>
                  <SelectItem value="link">Account Links</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="secondary" onClick={fetchItems} disabled={loading} className="h-8">
              Apply
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Flagged Items
            </span>
            {!loading && (
              <span className="text-sm font-normal text-muted-foreground">
                {items.length} item{items.length !== 1 ? 's' : ''} need{items.length === 1 ? 's' : ''} review
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && <div className="text-red-600 mb-4">{error}</div>}

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <CheckCircle className="h-8 w-8 mx-auto mb-3 text-green-500" />
              <p className="text-sm">No flagged items match the current filters.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Doc ID</TableHead>
                  <TableHead>Form</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Filename</TableHead>
                  <TableHead>Account / Entity</TableHead>
                  <TableHead>Warnings</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={`${item.item_type}-${item.document_id}-${item.link_id ?? idx}`} className="hover:bg-muted/50 align-top">
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={item.item_type === 'link' ? 'secondary' : 'outline'}>
                        {item.item_type === 'link' ? `Link #${item.link_id}` : 'Document'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <a
                        href={item.review_url}
                        className="hover:underline text-primary"
                        title={`Open document #${item.document_id}`}
                      >
                        #{item.document_id}
                        <ExternalLink className="inline h-3 w-3 ml-0.5 opacity-60" />
                      </a>
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{item.form_type}</TableCell>
                    <TableCell className="text-sm">{item.tax_year}</TableCell>
                    <TableCell className="text-xs max-w-[180px] truncate" title={item.original_filename ?? undefined}>
                      {item.original_filename ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate" title={accountLabel(item)}>
                      {accountLabel(item)}
                    </TableCell>
                    <TableCell className="max-w-[360px]">
                      <WarningList warnings={item.warnings} />
                    </TableCell>
                    <TableCell>
                      <AcknowledgeButton item={item} onAcknowledged={handleAcknowledged} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Container>
  )
}
