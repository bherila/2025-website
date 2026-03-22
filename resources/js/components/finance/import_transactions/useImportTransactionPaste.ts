import { useCallback, useEffect } from 'react'

import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import type { IbStatementData } from '@/data/finance/parseIbCsv'
import { parseImportData } from '@/data/finance/parseImportData'

interface ParsedImportData {
  data: AccountLineItem[] | null
  statement: IbStatementData | null
  parseError: string | null
}

interface UseImportTransactionPasteOptions {
  onFileReceived: (file: File) => void
  onTextReceived: (text: string) => void
  onParsedData: (parsed: ParsedImportData) => void
  setPdfData: (data: null) => void
  setFileInfo: (info: { name: string; type: string; size: number }) => void
}

/**
 * Handles Ctrl+V paste events for the import page.
 * Supports pasting files (e.g. screenshots) and plain text (e.g. CSV data).
 * Also handles parsing of text data when it changes.
 */
export function useImportTransactionPaste({
  onFileReceived,
  onTextReceived,
  onParsedData,
  setPdfData,
  setFileInfo,
}: UseImportTransactionPasteOptions) {
  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) {
            event.preventDefault()
            onFileReceived(file)
            return
          }
        }
      }

      // If no files, check for text
      const textData = event.clipboardData?.getData('text/plain')
      if (textData) {
        event.preventDefault()
        setFileInfo({ name: 'Pasted text', type: 'text/plain', size: textData.length })
        setPdfData(null)
        onTextReceived(textData.trimStart())
      }
    },
    [onFileReceived, onTextReceived, setPdfData, setFileInfo],
  )

  // Parse text data when it changes (CSV/QIF/OFX parsing)
  const parseTextData = useCallback(
    (text: string) => {
      if (!text) {
        onParsedData({ data: null, statement: null, parseError: null })
        return
      }

      try {
        const parsed = parseImportData(text)
        onParsedData({
          data: parsed.data,
          statement: parsed.statement,
          parseError: parsed.parseError,
        })
      } catch (e) {
        onParsedData({
          data: null,
          statement: null,
          parseError: e instanceof Error ? e.message : 'Failed to parse text data',
        })
      }
    },
    [onParsedData],
  )

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => {
      document.removeEventListener('paste', handlePaste)
    }
  }, [handlePaste])

  return { parseTextData }
}
