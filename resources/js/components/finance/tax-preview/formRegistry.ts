import type { KeyAmount, MillerDrillTarget, MillerRegistryEntry, MillerRenderProps } from '@/components/ui/miller'

import type { useTaxPreview } from '../TaxPreviewContext'

export type { KeyAmount } from '@/components/ui/miller'

export type TaxPreviewState = ReturnType<typeof useTaxPreview>

export type FormId =
  | 'home'
  | 'estimate'
  | 'action-items'
  | 'documents'
  | 'w2-summary'
  | 'tax-lot-reconciliation'
  | 'capital-gains-reconciliation'
  | 'k1-all-in-one'
  | 'k3-all-in-one'
  | 'form-1040'
  | 'sch-1'
  | 'sch-2'
  | 'sch-3'
  | 'sch-a'
  | 'sch-b'
  | 'sch-c'
  | 'sch-d'
  | 'sch-e'
  | 'sch-f'
  | 'sch-se'
  | 'form-1116'
  | 'form-4797'
  | 'form-4952'
  | 'form-6251'
  | 'form-8582'
  | 'form-8606'
  | 'form-8949'
  | 'form-8995'
  | 'wks-se-401k'
  | 'wks-amt-exemption'
  | 'wks-taxable-ss'
  | 'wks-1116-apportionment'

export type Presentation = 'column' | 'modal' | 'app'

export type FormCategory = 'Schedule' | 'Form' | 'Worksheet' | 'App'

export type InstanceRef = { key: string; label: string }

export type DrillTarget = MillerDrillTarget<FormId>

export type FormRenderProps = MillerRenderProps<TaxPreviewState, FormId>

export interface TaxFormMeta {
  category: FormCategory
  keywords: string[]
  formNumber?: string
  relatedForms?: FormId[]
  keyAmounts?: (state: TaxPreviewState) => KeyAmount[] | null
  hasData?: (state: TaxPreviewState) => boolean
}

export interface FormRegistryEntry extends MillerRegistryEntry<TaxPreviewState, FormId, TaxFormMeta> {
  keywords: string[]
  category: FormCategory
  formNumber?: string
  relatedForms?: FormId[]
  keyAmounts?: (state: TaxPreviewState) => KeyAmount[] | null
  hasData?: (state: TaxPreviewState) => boolean
}

export type FormRegistry = Record<FormId, FormRegistryEntry>

export function getTaxFormMeta(entry: FormRegistryEntry): TaxFormMeta {
  if (entry.meta) {
    return entry.meta
  }

  return {
    category: entry.category,
    keywords: entry.keywords,
    ...(entry.formNumber ? { formNumber: entry.formNumber } : {}),
    ...(entry.relatedForms ? { relatedForms: entry.relatedForms } : {}),
    ...(entry.keyAmounts ? { keyAmounts: entry.keyAmounts } : {}),
    ...(entry.hasData ? { hasData: entry.hasData } : {}),
  }
}

export function getEntry(registry: FormRegistry, id: FormId): FormRegistryEntry {
  const entry = registry[id]
  if (!entry) {
    throw new Error(`Form registry has no entry for id: ${id}`)
  }
  return entry
}

export function isMultiInstance(entry: FormRegistryEntry): boolean {
  return entry.instances !== undefined
}
