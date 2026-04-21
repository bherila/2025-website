import { extractK3IncomeBreakdown } from '@/finance/1116/k3-to-1116'
import { isFK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

function toNum(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export interface UnreviewedRelevantK1 {
  id: number
  partnerName: string
}

export function getRelevantUnreviewedK1Docs(allK1Docs: TaxDocument[]): UnreviewedRelevantK1[] {
  return allK1Docs
    .filter((doc) => doc.form_type === 'k1' && !doc.is_reviewed)
    .flatMap((doc) => {
      if (!isFK1StructuredData(doc.parsed_data)) {
        return []
      }

      const parsed = doc.parsed_data
      const breakdown = extractK3IncomeBreakdown(parsed)
      const box21 = toNum(parsed.fields['21']?.value)
      const box16IorJ = (parsed.codes['16'] ?? [])
        .filter((item) => ['I', 'J'].includes(item.code.toUpperCase()))
        .some((item) => toNum(item.value) !== 0)
      const hasK3Section4 = (parsed.k3?.sections ?? []).some((section) => section.sectionId === 'part3_section4')

      const isRelevant = breakdown.sourcedByPartner !== 0 || box21 !== 0 || box16IorJ || hasK3Section4
      if (!isRelevant) {
        return []
      }

      return [{
        id: doc.id,
        partnerName: parsed.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? `K-1 #${doc.id}`,
      }]
    })
}
