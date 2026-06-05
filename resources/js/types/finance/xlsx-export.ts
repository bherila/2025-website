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

export const XLSX_GRID_MAX_COLUMNS = 64

export type XlsxGridRowKind = 'title' | 'section' | 'header' | 'data' | 'total'

export type XlsxGridCellValue = string | number | null

export type XlsxGridColumnFormat = 'currency' | 'number' | 'percent' | 'text'

export interface XlsxGridColumn {
  key: string
  label: string
  width?: number | undefined
  format?: XlsxGridColumnFormat | undefined
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

export interface TaxPreviewXlsxExportOptions {
  filename?: string | undefined
  scope?: XlsxExportScope | undefined
  grids?: XlsxGridSheet[] | undefined
}

export type TaxPreviewXlsxExporter = (options?: TaxPreviewXlsxExportOptions) => void | Promise<void>
