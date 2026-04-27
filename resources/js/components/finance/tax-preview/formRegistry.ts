import type { ComponentType } from 'react'

import type { TaxReturn1040 } from '@/types/finance/tax-return'
import type { XlsxSheet } from '@/types/finance/xlsx-export'

import type { useTaxPreview } from '../TaxPreviewContext'

export type TaxPreviewState = ReturnType<typeof useTaxPreview>

export type FormId =
  | 'home'
  | 'estimate'
  | 'action-items'
  | 'documents'
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

export interface InstanceRef {
  key: string
  label: string
}

export interface DrillTarget {
  form: FormId
  instance?: string
}

export interface FormRenderProps {
  state: TaxPreviewState
  instance?: InstanceRef
  onDrill: (target: DrillTarget) => void
}

export interface KeyAmount {
  label: string
  value: number
}

export interface FormRegistryEntry {
  id: FormId
  label: string
  shortLabel: string
  formNumber?: string
  keywords: string[]
  category: FormCategory
  presentation: Presentation
  instances?: {
    list: (state: TaxPreviewState) => InstanceRef[]
    create: (state: TaxPreviewState) => InstanceRef
    allowCreate: boolean
  }
  component: ComponentType<FormRenderProps>
  relatedForms?: FormId[]
  /** When true, the column renders at double width (960px) in the Miller shell. */
  wide?: boolean
  /**
   * Returns key amounts to display on the form button in the home view.
   * Return null when the form has no data yet.
   */
  keyAmounts?: (state: TaxPreviewState) => KeyAmount[] | null
  /**
   * Returns true when the form has data for the current return.
   * Used to fade and sort N/A forms to the end of the home view grid.
   * When absent and keyAmounts is defined, derives from keyAmounts !== null.
   * When both are absent, always considered active.
   */
  hasData?: (state: TaxPreviewState) => boolean
  /**
   * XLSX export contribution. When present, `buildTaxWorkbook` invokes
   * `build` once per instance (or once total for singletons) and includes
   * non-empty sheets in the exported workbook, ordered by `order`.
   */
  xlsx?: {
    sheetName: (instance?: InstanceRef) => string
    order?: number
    build: (taxReturn: TaxReturn1040, instance?: InstanceRef) => XlsxSheet | null
  }
}

export type FormRegistry = Record<FormId, FormRegistryEntry>

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
