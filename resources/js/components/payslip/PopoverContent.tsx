'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface CustomDialogProps {
  open: boolean
  onClose: () => void
  value: any
}

const CustomDialog: React.FC<CustomDialogProps> = ({ open, onClose, value }) => {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Detail view</DialogTitle>
        </DialogHeader>
        <Textarea
          readOnly
          className="font-mono h-[400px]"
          value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
        />
      </DialogContent>
    </Dialog>
  )
}

function PopoverContent(props: { content: any }) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        View Details
      </Button>
      <CustomDialog open={open} onClose={() => setOpen(false)} value={props.content} />
    </div>
  )
}

export default PopoverContent
