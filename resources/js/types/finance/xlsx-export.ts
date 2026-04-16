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
