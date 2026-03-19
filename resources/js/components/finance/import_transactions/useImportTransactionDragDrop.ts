import React, { useCallback, useState } from 'react'

interface UseImportTransactionDragDropOptions {
  onFileReceived: (file: File) => void
}

interface UseImportTransactionDragDropResult {
  isDragOver: boolean
  handleFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  handleDrop: (event: React.DragEvent<HTMLDivElement>) => void
  handleDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  handleDragLeave: (event: React.DragEvent<HTMLDivElement>) => void
}

/**
 * Handles file drag-and-drop and file-input-change events for the import page.
 */
export function useImportTransactionDragDrop({
  onFileReceived,
}: UseImportTransactionDragDropOptions): UseImportTransactionDragDropResult {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (files && files.length > 0) {
        onFileReceived(files[0]!)
      }
      // Reset so the same file can be re-selected
      event.target.value = ''
    },
    [onFileReceived],
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragOver(false)
      const files = event.dataTransfer?.files
      if (files && files.length > 0) {
        onFileReceived(files[0]!)
      }
    },
    [onFileReceived],
  )

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)
  }, [])

  return { isDragOver, handleFileInputChange, handleDrop, handleDragOver, handleDragLeave }
}
