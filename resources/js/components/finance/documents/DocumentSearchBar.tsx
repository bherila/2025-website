import { Search } from 'lucide-react'

import { Input } from '@/components/ui/input'

interface DocumentSearchBarProps {
  value: string
  onChange: (value: string) => void
}

export default function DocumentSearchBar({ value, onChange }: DocumentSearchBarProps) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search documents..."
        className="pl-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
