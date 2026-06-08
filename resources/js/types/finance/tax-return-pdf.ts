export type TaxReturnPdfScope = 'form' | 'return'

export type TaxReturnPdfMode = 'editable' | 'print'

export type TaxReturnPdfFormId = 'form-1040'

export interface TaxReturnPdfExportPayload {
  year: number
  scope: TaxReturnPdfScope
  mode: TaxReturnPdfMode
  formId?: TaxReturnPdfFormId | undefined
  filename?: string | undefined
}

export interface TaxReturnPdfExportResult {
  ok: boolean
  message?: string | undefined
  errors: string[]
  warnings: string[]
}

export type TaxReturnPdfExporter = (payload: TaxReturnPdfExportPayload) => Promise<TaxReturnPdfExportResult>
