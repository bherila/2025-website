'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface OrderControlsProps {
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}

export function OrderControls({ onMoveUp, onMoveDown, isFirst, isLast }: OrderControlsProps) {
  return (
    <div className="flex flex-col gap-1">
      <Button variant="ghost" size="icon-sm" onClick={onMoveUp} disabled={isFirst} title="Move up">
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onMoveDown} disabled={isLast} title="Move down">
        <ArrowDown className="h-4 w-4" />
      </Button>
    </div>
  )
}
