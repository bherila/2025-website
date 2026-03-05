import { ExternalLink } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import PdfViewer from './PdfViewer'

interface StatementPdfModalProps {
  isOpen: boolean
  onClose: () => void
  pdfUrl: string
  title?: string
}

export default function StatementPdfModal({
  isOpen,
  onClose,
  pdfUrl,
  title = 'Statement PDF',
}: StatementPdfModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] w-full h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 border-b flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-xl font-semibold truncate pr-8">
            {title}
          </DialogTitle>
          <div className="flex items-center gap-2 mr-8">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(pdfUrl, '_blank')}
              className="h-8"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Open in New Tab
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          <PdfViewer url={pdfUrl} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
