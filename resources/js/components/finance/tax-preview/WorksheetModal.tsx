import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { useTaxPreview } from '../TaxPreviewContext'
import { type FormId, getEntry } from './formRegistry'
import { formRegistry } from './registry'

interface WorksheetModalProps {
  worksheetId: FormId | null
  onClose: () => void
}

/**
 * Renders a registry entry whose presentation is 'modal' as a shadcn Dialog.
 * Locks the underlying column stack while open (default Dialog behavior).
 */
export function WorksheetModal({ worksheetId, onClose }: WorksheetModalProps): React.ReactElement | null {
  const state = useTaxPreview()
  if (!worksheetId) {
    return null
  }
  const entry = getEntry(formRegistry, worksheetId)
  if (entry.presentation !== 'modal') {
    return null
  }
  const Component = entry.component
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry.label}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Worksheet — closes the column stack untouched on dismiss.
          </DialogDescription>
        </DialogHeader>
        <Component state={state} onDrill={() => {}} />
      </DialogContent>
    </Dialog>
  )
}
