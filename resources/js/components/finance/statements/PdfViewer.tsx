import { ChevronFirst,ChevronLast, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

// For TypeScript, we need to declare the global pdfjsLib
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

// Set worker source if not already set globally
const pdfjsLib = window.pdfjsLib;
if (pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
}

interface PdfViewerProps {
  url: string
}

export default function PdfViewer({ url }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdf, setPdf] = useState<any>(null) // Use any for PDFDocumentProxy if type not easily accessible globally
  const [pageNum, setPageNumber] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const renderTaskRef = useRef<any>(null)

  useEffect(() => {
    const loadPdf = async () => {
      setIsLoading(true)
      setError(null)

      if (!pdfjsLib) {
        console.error('pdfjsLib not found on window')
        setError('PDF viewer engine failed to load.')
        setIsLoading(false)
        return
      }

      try {
        const loadingTask = pdfjsLib.getDocument(url)
        const pdfDoc = await loadingTask.promise
        setPdf(pdfDoc)
        setNumPages(pdfDoc.numPages)
        setPageNumber(1)
      } catch (err) {
        console.error('Error loading PDF:', err)
        setError('Failed to load PDF. Please try downloading it instead.')
      } finally {
        setIsLoading(false)
      }
    }
    loadPdf()
  }, [url])

  const renderPage = useCallback(async (num: number, currentScale: number) => {
    if (!pdf || !canvasRef.current) return

    // Cancel existing render task if any
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel()
    }

    try {
      const page = await pdf.getPage(num)
      const viewport = page.getViewport({ scale: currentScale })
      const canvas = canvasRef.current
      const context = canvas.getContext('2d')

      if (!context) return

      canvas.height = viewport.height
      canvas.width = viewport.width

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        canvas: canvas,
      }

      const renderTask = page.render(renderContext)
      renderTaskRef.current = renderTask
      await renderTask.promise
    } catch (err: any) {
      if (err.name === 'RenderingCancelledException') {
        // Normal, ignore
      } else {
        console.error('Error rendering page:', err)
      }
    }
  }, [pdf])

  useEffect(() => {
    if (pdf) {
      renderPage(pageNum, scale)
    }
  }, [pdf, pageNum, scale, renderPage])

  const changePage = (offset: number) => {
    setPageNumber((prev) => Math.min(Math.max(1, prev + offset), numPages))
  }

  const zoom = (factor: number) => {
    setScale((prev) => Math.min(Math.max(0.5, prev * factor), 3.0))
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Spinner />
        <p className="mt-2 text-muted-foreground">Loading statement...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-destructive italic">
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center justify-between p-2 bg-muted/50 border-b mb-2 rounded-t-lg sticky top-0 z-10">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setPageNumber(1)} disabled={pageNum <= 1}>
            <ChevronFirst className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => changePage(-1)} disabled={pageNum <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm px-2">
            Page {pageNum} of {numPages}
          </span>
          <Button variant="ghost" size="icon" onClick={() => changePage(1)} disabled={pageNum >= numPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setPageNumber(numPages)} disabled={pageNum >= numPages}>
            <ChevronLast className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => zoom(0.8)}>
            <span className="text-lg font-bold">-</span>
          </Button>
          <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-[60px] justify-center">
            <ZoomIn className="h-3 w-3" />
            {Math.round(scale * 100)}%
          </div>
          <Button variant="ghost" size="icon" onClick={() => zoom(1.2)}>
            <span className="text-lg font-bold">+</span>
          </Button>
        </div>
      </div>

      {/* Canvas container */}
      <div className="flex-1 overflow-auto flex justify-center bg-zinc-800 p-4 rounded-b-lg min-h-[60vh]">
        <div className="shadow-2xl">
          <canvas ref={canvasRef} className="max-w-full" />
        </div>
      </div>
    </div>
  )
}
