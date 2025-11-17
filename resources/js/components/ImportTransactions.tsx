import { useMemo, useState, useCallback } from 'react'
import { ZodError } from 'zod'
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import TransactionsTable from './TransactionsTable'
import { parseEtradeCsv } from '@/data/finance/parseEtradeCsv'

import { parseQuickenQFX } from '@/data/finance/parseQuickenQFX'
import { Button } from '@/components/ui/button'
import { splitDelimitedText } from '@/lib/splitDelimitedText'
import { parseWealthfrontHAR } from '@/data/finance/parseWealthfrontHAR'
import { parseFidelityCsv } from '@/data/finance/parseFidelityCsv'
import { DateContainer, parseDate } from '@/lib/DateHelper'
import { fetchWrapper } from '@/fetchWrapper'
import { Spinner } from '@/components/ui/spinner'

export default function ImportTransactions(props: {
  onImportClick: (data: AccountLineItem[]) => void
  duplicates: AccountLineItem[]
}) {
  const [text, setText] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value)
  }

  const handleFileRead = useCallback(async (file: File) => {
    try {
      if (file.type === 'application/pdf') {
        setLoading(true)
        const formData = new FormData()
        formData.append('file', file)
        try {
          const response = await fetchWrapper.post('/api/finance/transactions/import-gemini', formData)
          setText(response)
        } catch (e) {
          setError(`Error processing PDF: ${e instanceof Error ? e.message : String(e)}`)
        } finally {
          setLoading(false)
        }
      } else {
        const text = await file.text()
        setText(text)
      }
      setError(null)
    } catch (err) {
      setError(`Error reading file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragOver(false)

      const files = event.dataTransfer?.files
      if (files && files.length > 0) {
        const file = files[0]
        if (file) {
          handleFileRead(file)
        }
      }
    },
    [handleFileRead],
  )

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)
  }, [])

  const { data, parseError } = useMemo((): { data: AccountLineItem[] | null; parseError: string | null } => {
    // If text is empty, return null data and no parse error
    if (!text.trim()) {
      return { data: null, parseError: null }
    }
    return parseData(text)
  }, [text])

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={{
        border: isDragOver ? '2px dashed #007bff' : '2px dashed #ced4da',
        padding: '20px',
        textAlign: 'center',
        transition: 'border-color 0.3s',
      }}
    >
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {parseError && <div style={{ color: 'red' }}>{parseError}</div>}

      {loading ? (
        <div className="flex justify-center items-center h-40">
          <Spinner />
          <p className="ml-2">Processing PDF...</p>
        </div>
      ) : (
        <textarea
          value={text}
          onChange={handleTextareaChange}
          placeholder="date, [time], [settlement date|post date|as of[ date]], [description | desc], amount, [comment | memo, type, category]"
          rows={5}
          style={{ width: '100%' }}
        />
      )}

      {props.duplicates.length > 0 && (
        <div className="my-2 text-red-500">
          <p>{props.duplicates.length} duplicate transactions were found and will not be imported. They are highlighted in the table below.</p>
        </div>
      )}

      {data && data.length > 0 && (
        <>
          <div className="my-2">
            <Button
              className="mx-1"
              onClick={(e) => {
                e.preventDefault()
                data && props.onImportClick(data)
              }}
            >
              Import {data.length}
            </Button>
            <Button className="mx-1" onClick={() => setText('')}>
              Clear
            </Button>
          </div>

          <TransactionsTable data={data} duplicates={props.duplicates} />
        </>
      )}
    </div>
  )
}

function parseData(text: string): { data: AccountLineItem[] | null; parseError: string | null } {
  // Try parsing as ETrade CSV
  const eTradeData = parseEtradeCsv(text)
  if (eTradeData.length > 0) {
    return {
      data: eTradeData,
      parseError: null,
    }
  }

  // Try parsing as QFX
  const qfxData = parseQuickenQFX(text)
  if (qfxData.length > 0) {
    return {
      data: qfxData,
      parseError: null,
    }
  }
  // Try parsing as Wealthfront HAR
  const Wealthfront = parseWealthfrontHAR(text)
  if (Wealthfront.length > 0) {
    return {
      data: Wealthfront,
      parseError: null,
    }
  }

  // Try parsing as Fidelity
  const Fidelity = parseFidelityCsv(text)
  if (Fidelity.length > 0) {
    return {
      data: Fidelity,
      parseError: null,
    }
  }

  const data: AccountLineItem[] = []
  let parseError: string | null = null
  try {
    const lines = splitDelimitedText(text)
    let dateColIndex: number | null = null
    let postDateColIndex: number | null = null
    let timeColIndex: number | null = null
    let descriptionColIndex: number | null = null
    let amountColIndex: number | null = null
    let commentColIndex: number | null = null
    let typeColIndex: number | null = null
    let categoryColIndex: number | null = null
    if (lines.length > 0 && lines[0]) {
      const getColumnIndex = (...headers: string[]) => {
        const firstLine = lines[0]!.map((cell) => cell.trim())
        for (const header of headers) {
          const index = firstLine.indexOf(header.trim())
          if (index !== -1) {
            return index
          }
        }
        return null
      }
      dateColIndex = getColumnIndex('Date', 'Transaction Date', 'date')
      postDateColIndex = getColumnIndex('Post Date', 'As of', 'As of Date', 'Settlement Date', 'Date Settled', 'Settled')
      timeColIndex = getColumnIndex('Time', 'time')
      descriptionColIndex = getColumnIndex('Description', 'Desc', 'description')
      amountColIndex = getColumnIndex('Amount', 'Amt', 'amount')
      commentColIndex = getColumnIndex('Comment', 'Memo', 'memo')
      typeColIndex = getColumnIndex('Type')
      categoryColIndex = getColumnIndex('Category')
    }
    if (dateColIndex == null) {
      throw new Error('Date column not found')
    }
    if (descriptionColIndex == null) {
      throw new Error('Description column not found')
    }
    if (amountColIndex == null) {
      throw new Error('Amount column not found')
    }
    for (const row of lines) {
      if (row[dateColIndex]?.trim().toLowerCase() === 'date' || row[dateColIndex]?.trim().toLowerCase() === 'transaction date') {
        continue
      }
      data.push(
        AccountLineItemSchema.parse({
          t_date: parseDate(row[dateColIndex])?.formatYMD() ?? row[dateColIndex],
          t_date_posted: postDateColIndex ? parseDate(row[postDateColIndex])?.formatYMD() : null,
          t_description: row[descriptionColIndex],
          t_amt: row[amountColIndex], // Pass raw string for t_amt, letting Zod handle the parsing
          t_comment: commentColIndex ? row[commentColIndex] : null,
          t_type: typeColIndex ? row[typeColIndex] : null,
          t_schc_category: categoryColIndex ? row[categoryColIndex] : null,
        }),
      )
    }
  } catch (e) {
    parseError = e instanceof ZodError ? e.message : (e?.toString() ?? null)
  }
  return {
    data: data.length > 0 ? data : null,
    parseError,
  }
}
