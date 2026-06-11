import { FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'

export default function DocumentEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-3 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <FileText className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No documents found</p>
        <p className="text-sm text-muted-foreground">Try adjusting your filters, or import a new document.</p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <a href="/finance/documents">Import W-2, 1099, K-1, or broker tax package</a>
      </Button>
    </div>
  )
}
