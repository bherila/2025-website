import { FileText } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { fetchWrapper } from '@/fetchWrapper'

import StatementPdfModal from './StatementPdfModal'

interface StatementPdfButtonProps {
  accountId: number
  statementId: number
  iconOnly?: boolean
  className?: string
  title?: string
}

export default function StatementPdfButton({
  accountId,
  statementId,
  iconOnly = false,
  className = '',
  title,
}: StatementPdfButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pdfData, setPdfData] = useState<{ view_url: string; filename: string } | null>(null)
  const [hasError, setHasError] = useState(false)

  const handleOpen = async () => {
    if (pdfData) {
      setIsOpen(true)
      return
    }

    setLoading(true)
    setHasError(false)
    try {
      const data = await fetchWrapper.get(`/api/finance/${accountId}/statements/${statementId}/pdf`)
      setPdfData(data)
      setIsOpen(true)
    } catch (err) {
      console.error('Failed to fetch statement PDF:', err)
      setHasError(true)
    } finally {
      setLoading(false)
    }
  }

  if (hasError && iconOnly) {
    return null // Don't show anything if it failed and we're in a list
  }

  const button = (
    <Button
      variant="outline"
      size={iconOnly ? 'sm' : 'default'}
      onClick={handleOpen}
      disabled={loading}
      className={className}
    >
      <FileText className={`h-4 w-4 ${!iconOnly ? 'mr-2' : ''}`} />
      {!iconOnly && (title || 'View PDF')}
    </Button>
  )

  return (
    <>
      <TooltipProvider>
        {iconOnly ? (
          <Tooltip>
            <TooltipTrigger asChild>
              {button}
            </TooltipTrigger>
            <TooltipContent>
              <p>View Original PDF</p>
            </TooltipContent>
          </Tooltip>
        ) : button}
      </TooltipProvider>

      {pdfData && (
        <StatementPdfModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          pdfUrl={pdfData.view_url}
          title={title || `Statement PDF: ${pdfData.filename}`}
        />
      )}
    </>
  )
}
