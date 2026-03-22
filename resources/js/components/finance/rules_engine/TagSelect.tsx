'use client'

import { Check } from 'lucide-react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import type { FinanceTag } from '../useFinanceTags'

interface TagSelectProps {
  value: string | null
  onChange: (value: string) => void
  tags: FinanceTag[]
  placeholder?: string
  className?: string
}

/**
 * Shared TagSelect component that displays tags with their colors inline.
 * Used for selecting tags in various contexts (e.g., rule actions, filters).
 */
export function TagSelect({ value, onChange, tags, placeholder = 'Select tag...', className }: TagSelectProps) {
  const selectedTag = tags.find((t) => String(t.tag_id) === String(value))

  return (
    <Select value={value ?? ''} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder}>
          {selectedTag && (
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: selectedTag.tag_color }}
                title={selectedTag.tag_color}
              />
              <span>{selectedTag.tag_label}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {tags.map((tag) => (
          <SelectItem key={tag.tag_id} value={String(tag.tag_id)}>
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: tag.tag_color }}
                title={tag.tag_color}
              />
              <span>{tag.tag_label}</span>
              {String(tag.tag_id) === String(value) && <Check className="ml-auto h-4 w-4" />}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
