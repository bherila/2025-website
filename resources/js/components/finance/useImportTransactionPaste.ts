import { useCallback, useEffect } from 'react'

interface UseImportTransactionPasteOptions {
  onFileReceived: (file: File) => void
  onTextReceived: (text: string) => void
  setPdfData: (data: null) => void
  setFileInfo: (info: { name: string; type: string; size: number }) => void
}

/**
 * Handles Ctrl+V paste events for the import page.
 * Supports pasting files (e.g. screenshots) and plain text (e.g. CSV data).
 */
export function useImportTransactionPaste({
  onFileReceived,
  onTextReceived,
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

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => {
      document.removeEventListener('paste', handlePaste)
    }
  }, [handlePaste])
}
