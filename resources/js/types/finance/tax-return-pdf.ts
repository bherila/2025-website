export type TaxReturnPdfScope = 'form' | 'return' | 'selection'

export type TaxReturnPdfMode = 'editable' | 'print'

export type TaxReturnPdfFormId = 'form-1040' | 'schedule-1' | 'schedule-3' | 'schedule-d' | 'form-8949'

export interface TaxReturnPdfExportPayload {
  year: number
  scope: TaxReturnPdfScope
  mode: TaxReturnPdfMode
  formId?: TaxReturnPdfFormId | undefined
  formIds?: TaxReturnPdfFormId[] | undefined
  includeProfilePii?: boolean | undefined
  filename?: string | undefined
}

export interface TaxReturnPdfSupportedFormOption {
  id: TaxReturnPdfFormId
  label: string
  category: string
  available: boolean
  recommended: boolean
  hasData: boolean
  warnings: string[]
}

export interface TaxReturnPdfUnsupportedRequiredForm {
  id: string
  label: string
  reason: string
}

export interface TaxReturnPdfExportOptionsResponse {
  year: number
  supportedForms: TaxReturnPdfSupportedFormOption[]
  recommendedFormIds: TaxReturnPdfFormId[]
  allSupportedFormIds: TaxReturnPdfFormId[]
  unsupportedRequiredForms: TaxReturnPdfUnsupportedRequiredForm[]
  warnings: string[]
}

export interface TaxReturnPdfExportResult {
  ok: boolean
  message?: string | undefined
  errors: string[]
  warnings: string[]
}

export type TaxReturnPdfExporter = (payload: TaxReturnPdfExportPayload) => Promise<TaxReturnPdfExportResult>
