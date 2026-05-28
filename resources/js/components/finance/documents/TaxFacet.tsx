import { ArrowUpRight, CheckCircle2, CircleAlert, FileCheck2, Pencil } from 'lucide-react'
import { useState } from 'react'

import TaxDocumentReviewModal from '@/components/finance/TaxDocumentReviewModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FORM_TYPE_LABELS, type TaxDocumentAccountLink } from '@/types/finance/tax-document'

import type { FinanceDocumentTaxFacet } from './types'

interface TaxFacetProps {
  facet: FinanceDocumentTaxFacet
  onUpdated: () => void
}

function labelForKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function ReviewBadge({ status }: { status: FinanceDocumentTaxFacet['review_status'] }) {
  if (status === 'reviewed') {
    return (
      <Badge className="border-green-200 bg-green-100 text-green-700 hover:bg-green-100">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Reviewed
      </Badge>
    )
  }

  if (status === 'needs_review') {
    return (
      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
        <CircleAlert className="mr-1 h-3 w-3" />
        Needs review
      </Badge>
    )
  }

  return <Badge variant="secondary">Unreviewed</Badge>
}

export default function TaxFacet({ facet, onUpdated }: TaxFacetProps) {
  const [reviewOpen, setReviewOpen] = useState(false)
  const [activeLink, setActiveLink] = useState<TaxDocumentAccountLink | undefined>(undefined)
  const reviewDocument = facet.review_document
  const countsByState = Object.entries(facet.downstream_effects.reconciliation_link_counts_by_state)
    .filter(([, count]) => count > 0)

  const openReview = (link?: TaxDocumentAccountLink): void => {
    setActiveLink(link)
    setReviewOpen(true)
  }

  const closeReview = (): void => {
    setReviewOpen(false)
    setActiveLink(undefined)
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase text-muted-foreground">Tax review</h3>
        <FileCheck2 className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{FORM_TYPE_LABELS[facet.form_type] ?? facet.form_type}</span>
        <span className="text-sm text-muted-foreground">{facet.tax_year}</span>
        <ReviewBadge status={facet.review_status} />
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Parsing</dt>
        <dd>{facet.parsing_status ?? 'ready'}</dd>
        <dt className="text-muted-foreground">Entries</dt>
        <dd>{facet.parsed_data_summary.entry_count.toLocaleString()}</dd>
        <dt className="text-muted-foreground">Warnings</dt>
        <dd>{facet.parsed_data_summary.warnings_count.toLocaleString()}</dd>
        <dt className="text-muted-foreground">Linked lots</dt>
        <dd>{facet.downstream_effects.linked_lots_count.toLocaleString()}</dd>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="h-8 gap-1" onClick={() => openReview()}>
          <Pencil className="h-3.5 w-3.5" />
          Review
        </Button>
        {facet.downstream_effects.linked_lots_count > 0 && (
          <Button asChild variant="outline" size="sm" className="h-8 gap-1">
            <a href={`/finance/tax-documents/${facet.tax_document_id}/lot-reconciliation`}>
              Reconcile
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>

      {facet.account_links.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase text-muted-foreground">Account links</h4>
          <ul className="space-y-2">
            {facet.account_links.map((link) => (
              <li key={link.id} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {link.account?.acct_name ?? link.ai_account_name ?? 'Unassigned'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {FORM_TYPE_LABELS[link.form_type] ?? link.form_type}
                      {link.ai_identifier ? ` - ${link.ai_identifier}` : ''}
                    </div>
                    {link.parsed_data_warnings && link.parsed_data_warnings.length > 0 && (
                      <div className="mt-1 text-xs text-amber-700">
                        {link.parsed_data_warnings.length} warning{link.parsed_data_warnings.length === 1 ? '' : 's'}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => openReview(link)}>
                      Review
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2" disabled>
                      Resolve
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {countsByState.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium uppercase text-muted-foreground">Reconciliation links</h4>
          <ul className="space-y-1 text-sm">
            {countsByState.map(([state, count]) => (
              <li key={state} className="flex items-center justify-between gap-2">
                <span>{labelForKey(state)}</span>
                <span className="font-medium">{count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {reviewOpen && (
        <TaxDocumentReviewModal
          open={reviewOpen}
          taxYear={facet.tax_year}
          document={reviewDocument}
          accountLink={activeLink}
          onClose={closeReview}
          onDocumentReviewed={onUpdated}
          onDocumentSaved={onUpdated}
          onDocumentDeleted={onUpdated}
        />
      )}
    </section>
  )
}
