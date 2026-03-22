import { Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface DisabledEditButtonProps {
  reason?: string
}

export default function DisabledEditButton({ reason = "This entry has been invoiced and cannot be edited." }: DisabledEditButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-block opacity-50 cursor-not-allowed">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled
          >
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{reason}</p>
      </TooltipContent>
    </Tooltip>
  )
}
