export interface XlsxRow {
  line?: string | undefined
  description: string
  amount?: number | undefined
  formula?: string | undefined
  note?: string | undefined
  isHeader?: boolean | undefined
  isTotal?: boolean | undefined
}

export interface XlsxSheet {
  name: string
  rows: XlsxRow[]
}

export interface XlsxWorkbook {
  filename: string
  sheets: XlsxSheet[]
}

export type XlsxExportScope = 'full' | 'k1-all-in-one' | 'k3-all-in-one'

export type XlsxGridSheetScope = Exclude<XlsxExportScope, 'full'>

export type XlsxGridRowKind = 'title' | 'section' | 'header' | 'data' | 'total'

export type XlsxGridCellValue = string | number | null

export interface XlsxGridColumn {
  key: string
  label: string
  width?: number | undefined
}

export interface XlsxGridRow {
  kind: XlsxGridRowKind
  label?: string | undefined
  cells?: Record<string, XlsxGridCellValue> | undefined
}

export interface XlsxGridSheet {
  name: string
  scope?: XlsxGridSheetScope | undefined
  columns: XlsxGridColumn[]
  rows: XlsxGridRow[]
}

export interface TaxPreviewXlsxExportPayload {
  year: number
  filename?: string | undefined
  scope?: XlsxExportScope | undefined
  grids?: XlsxGridSheet[] | undefined
}
