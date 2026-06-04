export type CsvCell = boolean | number | string | null | undefined

export function serializeCsvRows(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(serializeCsvCell).join(',')).join('\r\n')
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(objectUrl)
}

function serializeCsvCell(value: CsvCell): string {
  const text = value === null || value === undefined ? '' : String(value)

  if (!/[",\r\n]/.test(text)) {
    return text
  }

  return `"${text.replace(/"/g, '""')}"`
}
