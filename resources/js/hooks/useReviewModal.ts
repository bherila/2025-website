import { useState } from 'react'

import type { TaxDocument, TaxDocumentAccountLink } from '@/types/finance/tax-document'

/**
 * Shared state management for the tax document review modal.
 *
 * Both TaxDocuments1099Section and AccountTaxDocumentsSection need to track
 * a (document, optional link) pair for the review modal. This hook provides
 * a standard open/close API so both components behave consistently.
 */
export function useReviewModal() {
  const [reviewDoc, setReviewDoc] = useState<TaxDocument | null>(null)
  const [reviewLink, setReviewLink] = useState<TaxDocumentAccountLink | null>(null)

  const openReview = (doc: TaxDocument, link?: TaxDocumentAccountLink | null) => {
    setReviewDoc(doc)
    setReviewLink(link ?? null)
  }

  const closeReview = () => {
    setReviewDoc(null)
    setReviewLink(null)
  }

  return { reviewDoc, reviewLink, openReview, closeReview }
}
