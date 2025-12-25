'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { CheckIcon } from 'lucide-react'

interface Props {
  tagId: number
  tagLabel: string
  tagColor: string
  disabled?: boolean
  onApplyTag: (tagId: number, tagLabel: string) => Promise<void>
}

export function TagApplyButton({ tagId, tagLabel, tagColor, disabled, onApplyTag }: Props) {
  const [isApplying, setIsApplying] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  const handleClick = async () => {
    setIsApplying(true)
    setIsComplete(false)
    try {
      await onApplyTag(tagId, tagLabel)
      setIsComplete(true)
    } catch (error) {
      console.error('Failed to apply tag:', error)
    } finally {
      setIsApplying(false)
      // Reset complete state after 2 seconds
      setTimeout(() => setIsComplete(false), 2000)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || isApplying}
      onClick={handleClick}
      className={`bg-${tagColor}-200 text-${tagColor}-800`}
    >
      {isApplying ? <Spinner size="small" className="mr-2" /> : isComplete ? <CheckIcon className="mr-2 h-4 w-4" /> : null}
      {tagLabel}
    </Button>
  )
}
