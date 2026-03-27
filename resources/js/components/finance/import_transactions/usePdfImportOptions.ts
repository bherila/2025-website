import { useCallback, useState } from 'react'

function useLocalStorageBool(key: string, defaultValue: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key)
      return v === null ? defaultValue : v === 'true'
    } catch {
      return defaultValue
    }
  })

  const set = useCallback(
    (v: boolean) => {
      setValue(v)
      try {
        localStorage.setItem(key, String(v))
      } catch {
        /* ignore */
      }
    },
    [key],
  )

  return [value, set]
}

export interface PdfImportOptions {
  importTransactions: boolean
  setImportTransactions: (v: boolean) => void
  attachAsStatement: boolean
  setAttachAsStatement: (v: boolean) => void
}

/**
 * Manages the PDF import option checkboxes with localStorage persistence.
 * - "Import Transactions" and "Attach as Statement" shown after AI parsing
 */
export function usePdfImportOptions(): PdfImportOptions {
  const [importTransactions, setImportTransactions] = useLocalStorageBool('pdf_import_transactions', true)
  const [attachAsStatement, setAttachAsStatement] = useLocalStorageBool('pdf_attach_statement', true)

  return {
    importTransactions,
    setImportTransactions,
    attachAsStatement,
    setAttachAsStatement,
  }
}
