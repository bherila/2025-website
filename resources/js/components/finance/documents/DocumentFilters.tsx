import { Button } from '@/components/ui/button'

import { KIND_FILTERS } from './types'

interface DocumentFiltersProps {
  activeKind: string
  onKindChange: (kind: string) => void
}

export default function DocumentFilters({ activeKind, onKindChange }: DocumentFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {KIND_FILTERS.map((filter) => (
        <Button
          key={filter.value}
          variant={activeKind === filter.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => onKindChange(filter.value)}
        >
          {filter.label}
        </Button>
      ))}
    </div>
  )
}
