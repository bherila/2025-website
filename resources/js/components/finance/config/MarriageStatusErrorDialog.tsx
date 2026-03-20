'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface MarriageStatusErrorDialogProps {
  open: boolean
  errorMessage: string
  onClose: () => void
}

export default function MarriageStatusErrorDialog({
  open,
  errorMessage,
  onClose,
}: MarriageStatusErrorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unable to Update Status</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
        <DialogFooter>
          <Button onClick={onClose}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
