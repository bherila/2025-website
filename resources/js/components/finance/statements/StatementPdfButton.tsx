import { Download, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'

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
  hasPdf?: boolean
  showDownload?: boolean
  downloadVariant?: 'outline' | 'default' | 'ghost' | 'secondary'
}

export default function StatementPdfButton({
  accountId,
  statementId,
  iconOnly = false,
  className = '',
  title,
  hasPdf: initialHasPdf,
  showDownload = false,
  downloadVariant = 'outline',
}: StatementPdfButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(initialHasPdf === undefined)
  const [hasPdf, setHasPdf] = useState(initialHasPdf ?? false)
  const [pdfData, setPdfData] = useState<{ view_url: string; download_url: string; filename: string } | null>(null)
  const [hasError, setHasError] = useState(false)

  // If initialHasPdf is not provided, check if PDF exists
  useEffect(() => {
    if (initialHasPdf !== undefined) return

    const checkPdf = async () => {
      setChecking(true)
      try {
        const data = await fetchWrapper.get(`/api/finance/${accountId}/statements/${statementId}/pdf`)
        setPdfData(data)
        setHasPdf(true)
      } catch (err) {
        setHasPdf(false)
      } finally {
        setChecking(false)
      }
    }
    checkPdf()
  }, [accountId, statementId, initialHasPdf])

  if (checking) {
    return null
  }

  if (!hasPdf) {
    return null
  }

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
      setHasPdf(false) // Hide button if fetch fails (e.g. 404)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (pdfData?.download_url) {
      window.open(pdfData.download_url, '_blank')
    }
  }

  if (hasError && iconOnly) {
    return null // Don't show anything if it failed and we're in a list
  }

  const viewButton = (
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
      <div className="flex gap-2">
        <TooltipProvider>
          {iconOnly ? (
            <Tooltip>
              <TooltipTrigger asChild>
                {viewButton}
              </TooltipTrigger>
              <TooltipContent>
                <p>View Original PDF</p>
              </TooltipContent>
            </Tooltip>
          ) : viewButton}
        </TooltipProvider>

        {showDownload && hasPdf && (
          <Button variant={downloadVariant} size="sm" onClick={handleDownload} disabled={loading}>
            <Download className="h-4 w-4 mr-1" />
            Download PDF
          </Button>
        )}
      </div>

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
