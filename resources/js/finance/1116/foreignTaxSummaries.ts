import { iterateReviewedBrokerEntries } from '@/lib/finance/taxDocumentUtils'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import { isFK1StructuredData } from '@/types/finance/tax-document'

import {
  extractForeignTaxFrom1099Div,
  extractForeignTaxFrom1099Int,
  extractForeignTaxSummaries,
} from './k3-to-1116'
import type { ForeignTaxSummary } from './types'

function getSourceLabel(doc: TaxDocument, parsedData?: Record<string, unknown> | FK1StructuredData | null): string {
  if (doc.form_type === 'k1' && parsedData && isFK1StructuredData(parsedData)) {
    return parsedData.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
  }

  return ((parsedData as Record<string, unknown> | null | undefined)?.payer_name as string | undefined)
    ?? doc.employment_entity?.display_name
    ?? doc.original_filename
    ?? 'Tax document'
}

function withMetadata(
  summary: ForeignTaxSummary,
  doc: TaxDocument,
  sourceLabel: string,
): ForeignTaxSummary {
  return {
    ...summary,
    sourceDocumentId: doc.id,
    sourceDocumentFormType: doc.form_type,
    sourceLabel,
  }
}

export function collectForeignTaxSummaries(documents: TaxDocument[]): ForeignTaxSummary[] {
  const summaries: ForeignTaxSummary[] = []

  for (const doc of documents) {
    if (!doc.parsed_data) {
      continue
    }

    if (doc.form_type === 'broker_1099') {
      if (Array.isArray(doc.parsed_data)) {
        for (const [entry, link] of iterateReviewedBrokerEntries(doc)) {
          const parsedData = entry.parsed_data as Record<string, unknown>
          const sourceLabel = getSourceLabel(doc, parsedData)

          if (entry.form_type === '1099_div' || entry.form_type === '1099_div_c') {
            const summary = extractForeignTaxFrom1099Div(parsedData, link.account_id)
            if (summary) {
              summaries.push(withMetadata(summary, doc, sourceLabel))
            }
          } else if (entry.form_type === '1099_int' || entry.form_type === '1099_int_c') {
            const summary = extractForeignTaxFrom1099Int(parsedData, link.account_id)
            if (summary) {
              summaries.push(withMetadata(summary, doc, sourceLabel))
            }
          }
        }
      } else if (doc.is_reviewed) {
        const parsedData = doc.parsed_data as Record<string, unknown>
        const sourceLabel = getSourceLabel(doc, parsedData)
        const accountId = doc.account_links?.find((link) => link.account_id != null)?.account_id ?? doc.account_id

        const dividendSummary = extractForeignTaxFrom1099Div({ box7_foreign_tax: parsedData.div_7_foreign_tax_paid }, accountId)
        if (dividendSummary) {
          summaries.push(withMetadata(dividendSummary, doc, sourceLabel))
        }

        const interestSummary = extractForeignTaxFrom1099Int({ box6_foreign_tax: parsedData.int_6_foreign_tax_paid }, accountId)
        if (interestSummary) {
          summaries.push(withMetadata(interestSummary, doc, sourceLabel))
        }
      }

      continue
    }

    if (!doc.is_reviewed) {
      continue
    }

    const parsedData = doc.parsed_data as Record<string, unknown>
    const sourceLabel = getSourceLabel(doc, doc.form_type === 'k1' ? doc.parsed_data as FK1StructuredData : parsedData)
    const accountId = doc.account_links?.find((link) => link.account_id != null)?.account_id ?? doc.account_id

    if (doc.form_type === 'k1' && isFK1StructuredData(doc.parsed_data)) {
      for (const summary of extractForeignTaxSummaries(doc.parsed_data, accountId)) {
        summaries.push(withMetadata(summary, doc, sourceLabel))
      }
    } else if (doc.form_type === '1099_div' || doc.form_type === '1099_div_c') {
      const summary = extractForeignTaxFrom1099Div(parsedData, accountId)
      if (summary) {
        summaries.push(withMetadata(summary, doc, sourceLabel))
      }
    } else if (doc.form_type === '1099_int' || doc.form_type === '1099_int_c') {
      const summary = extractForeignTaxFrom1099Int(parsedData, accountId)
      if (summary) {
        summaries.push(withMetadata(summary, doc, sourceLabel))
      }
    }
  }

  return summaries
}
