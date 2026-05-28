import { Download, Eye, MoreHorizontal, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

import type { FinanceDocument } from './types'

interface DocumentRowActionsProps {
  document: FinanceDocument
  onView: ((doc: FinanceDocument) => void) | undefined
  onDownload: ((doc: FinanceDocument) => void) | undefined
  onDelete: ((doc: FinanceDocument) => void) | undefined
}

export default function DocumentRowActions({ document, onView, onDownload, onDelete }: DocumentRowActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const capabilities = document.capabilities ?? []

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>

      {menuOpen && (
        <div
          className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md"
          onMouseLeave={() => setMenuOpen(false)}
        >
          {capabilities.includes('view_original') && onView && (
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                onView(document)
                setMenuOpen(false)
              }}
            >
              <Eye className="h-4 w-4" /> View original
            </button>
          )}
          {capabilities.includes('download_original') && onDownload && (
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                onDownload(document)
                setMenuOpen(false)
              }}
            >
              <Download className="h-4 w-4" /> Download
            </button>
          )}
          {capabilities.includes('delete') && onDelete && (
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
              onClick={() => {
                onDelete(document)
                setMenuOpen(false)
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}
