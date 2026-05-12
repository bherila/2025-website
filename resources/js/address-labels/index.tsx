import { Download, Eye, FileText, Printer, Upload } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface SheetSpec {
  label_width: number
  label_height: number
  columns: number
  rows: number
  top_margin: number
  left_margin: number
  h_pitch: number
  v_pitch: number
  paper: string
}

interface AddressLabelOldInput {
  addresses: string
  bold_first_line: boolean
  copies: number | string
  font_size: number | string
  parser_mode: string
  sheet_number: string
  skip_count: number | string
  vertical_align: string
}

interface AddressLabelRoutes {
  calibration: string
  pdf: string
  preview: string
}

interface AddressLabelPageProps {
  csrfToken: string
  errors: string[]
  old: AddressLabelOldInput
  routes: AddressLabelRoutes
  sheetOptions: Record<string, SheetSpec>
}

const STORAGE_KEY = 'tools.address_labels.input.v3'

function parseInitialData(): AddressLabelPageProps | null {
  const element = document.getElementById('address-labels-data')
  if (!element?.textContent) {
    return null
  }

  return JSON.parse(element.textContent) as AddressLabelPageProps
}

function formatInches(value: number): string {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 3 })
}

function formatSheetOption(sheetNumber: string, spec: SheetSpec): string {
  const perPage = spec.rows * spec.columns

  return `Avery ${sheetNumber} - ${formatInches(spec.label_height)}" x ${formatInches(spec.label_width)}" (${perPage} per page)`
}

function readStoredAddresses(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeStoredAddresses(value: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    return
  }
}

function estimateRows(value: string, parserMode: string): number {
  const trimmed = value.trim()
  if (trimmed === '') {
    return 0
  }

  if (parserMode === 'blocks' || (parserMode === 'auto' && /\n\s*\n/.test(trimmed))) {
    return trimmed.split(/\n\s*\n/).filter((block) => block.trim() !== '').length
  }

  return countDelimitedRows(trimmed)
}

function countDelimitedRows(value: string): number {
  const normalized = value.replace(/\r\n?/g, '\n')
  let count = 0
  let inQuotes = false
  let recordHasContent = false

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]

    if (character === '"') {
      if (inQuotes && normalized[index + 1] === '"') {
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      recordHasContent = true
      continue
    }

    if (character === '\n' && !inQuotes) {
      if (recordHasContent) {
        count += 1
      }
      recordHasContent = false
      continue
    }

    if (character && /\S/.test(character)) {
      recordHasContent = true
    }
  }

  return recordHasContent ? count + 1 : count
}

function boundedInteger(value: string, fallback: number, min: number): number {
  const parsed = Number.parseInt(value, 10)

  if (Number.isNaN(parsed)) {
    return fallback
  }

  return Math.max(min, parsed)
}

function AddressLabelPage({ csrfToken, errors, old, routes, sheetOptions }: AddressLabelPageProps) {
  const sheetNumbers = Object.keys(sheetOptions)
  const initialSheetNumber = sheetOptions[old.sheet_number] ? old.sheet_number : '48163'
  const [sheetNumber, setSheetNumber] = useState(initialSheetNumber)
  const [parserMode, setParserMode] = useState(old.parser_mode)
  const [verticalAlign, setVerticalAlign] = useState(old.vertical_align)
  const [addresses, setAddresses] = useState(old.addresses)
  const [copies, setCopies] = useState(String(old.copies))
  const [skipCount, setSkipCount] = useState(String(old.skip_count))
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (old.addresses.trim() === '') {
      setAddresses(readStoredAddresses())
    }
  }, [old.addresses])

  const selectedSheet = sheetOptions[sheetNumber] ?? sheetOptions['48163'] ?? sheetOptions[sheetNumbers[0] ?? '']
  const perPage = selectedSheet ? selectedSheet.rows * selectedSheet.columns : 10
  const rowCount = useMemo(() => estimateRows(addresses, parserMode), [addresses, parserMode])
  const copiesInputId = 'copies'
  const skipInputId = 'skip_count'
  const fontSizeInputId = 'font_size'
  const labelCount = useMemo(() => {
    const copyCount = boundedInteger(copies, 1, 1)

    return rowCount === 0 ? 0 : rowCount + copyCount - 1
  }, [copies, rowCount])
  const pageCount = useMemo(() => {
    const skipped = boundedInteger(skipCount, 0, 0)

    return labelCount === 0 ? 0 : Math.ceil((labelCount + skipped) / perPage)
  }, [labelCount, perPage, skipCount])

  const calibrationUrl = useMemo(() => {
    const url = new URL(routes.calibration, window.location.href)
    url.searchParams.set('sheet_number', sheetNumber)

    return url.toString()
  }, [routes.calibration, sheetNumber])

  function updateAddresses(value: string): void {
    setAddresses(value)
    writeStoredAddresses(value)
  }

  function handleFile(file: File | undefined): void {
    if (!file) {
      return
    }

    void file.text().then(updateAddresses)
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    handleFile(event.target.files?.[0])
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setIsDragging(false)
    handleFile(event.dataTransfer.files[0])
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Address Label PDF Generator</h1>

        {errors.length > 0 && (
          <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {errors[0]}
          </div>
        )}

        <form className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2" method="POST" action={routes.pdf} target="_blank">
          <input type="hidden" name="_token" value={csrfToken} />
          <input type="hidden" name="sheet_number" value={sheetNumber} />
          <input type="hidden" name="parser_mode" value={parserMode} />
          <input type="hidden" name="vertical_align" value={verticalAlign} />

          <div>
            <label htmlFor="sheet_number_select" className="text-sm">Avery sheet number</label>
            <Select value={sheetNumber} onValueChange={setSheetNumber}>
              <SelectTrigger id="sheet_number_select" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sheetNumbers.map((optionSheetNumber) => {
                  const option = sheetOptions[optionSheetNumber]
                  if (!option) {
                    return null
                  }

                  return (
                    <SelectItem key={optionSheetNumber} value={optionSheetNumber}>
                      {formatSheetOption(optionSheetNumber, option)}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label htmlFor="parser_mode_select" className="text-sm">Parser mode</label>
            <Select value={parserMode} onValueChange={setParserMode}>
              <SelectTrigger id="parser_mode_select" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto detect</SelectItem>
                <SelectItem value="delimited">Delimited rows (CSV/TSV)</SelectItem>
                <SelectItem value="blocks">Blank-line separated blocks</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label htmlFor={fontSizeInputId} className="text-sm">Font size (pt)</label>
            <input id={fontSizeInputId} name="font_size" type="number" min="7" max="14" defaultValue={old.font_size} className="mt-1 w-full rounded border bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </div>

          <div>
            <label htmlFor={skipInputId} className="text-sm">Skip labels on first sheet</label>
            <input id={skipInputId} name="skip_count" type="number" min="0" max={Math.max(0, perPage - 1)} value={skipCount} onChange={(event) => setSkipCount(event.target.value)} className="mt-1 w-full rounded border bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </div>

          <div>
            <label htmlFor={copiesInputId} className="text-sm">Copies of first label</label>
            <input id={copiesInputId} name="copies" type="number" min="1" max="500" value={copies} onChange={(event) => setCopies(event.target.value)} className="mt-1 w-full rounded border bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
          </div>

          <div>
            <label htmlFor="vertical_align_select" className="text-sm">Vertical align</label>
            <Select value={verticalAlign} onValueChange={setVerticalAlign}>
              <SelectTrigger id="vertical_align_select" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top">Top</SelectItem>
                <SelectItem value="center">Center</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="bold_first_line" value="1" defaultChecked={old.bold_first_line} />
            Bold first line
          </label>

          <div
            className={`md:col-span-2 rounded border border-dashed p-3 ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-gray-300 dark:border-gray-700'}`}
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor="addresses" className="text-sm">Address rows</label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm dark:border-gray-700">
                <Upload className="size-4" />
                Import CSV/TSV
                <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain" className="sr-only" onChange={handleFileChange} />
              </label>
            </div>
            <textarea id="addresses" name="addresses" rows={14} value={addresses} onChange={(event) => updateAddresses(event.target.value)} className="mt-2 w-full rounded border bg-white px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-950" />
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {labelCount} {labelCount === 1 ? 'label' : 'labels'} - {pageCount} {pageCount === 1 ? 'page' : 'pages'}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit">
              <FileText className="size-4" />
              Open PDF
            </Button>
            <Button type="submit" name="download" value="1" variant="secondary">
              <Download className="size-4" />
              Download PDF
            </Button>
            <Button type="submit" formAction={routes.preview} formTarget="_blank" variant="outline">
              <Eye className="size-4" />
              Preview
            </Button>
            <Button asChild variant="outline">
              <a href={calibrationUrl} target="_blank" rel="noreferrer">
                <Printer className="size-4" />
                Print calibration sheet
              </a>
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

const data = parseInitialData()
const container = document.getElementById('address-labels-root')

if (data && container) {
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <AddressLabelPage {...data} />
    </React.StrictMode>
  )
}
