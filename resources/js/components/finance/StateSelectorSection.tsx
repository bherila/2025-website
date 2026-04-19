'use client'

import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchWrapper } from '@/fetchWrapper'

/** States that have bracket data in taxBracket.ts. */
const SUPPORTED_STATES: { code: string; name: string }[] = [
  { code: 'CA', name: 'California' },
  { code: 'NY', name: 'New York' },
]

interface StateSelectorSectionProps {
  year: number
  activeTaxStates: string[]
  onChange: (states: string[]) => void
}

export default function StateSelectorSection({ year, activeTaxStates, onChange }: StateSelectorSectionProps) {
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState<string | null>(null)

  const availableToAdd = SUPPORTED_STATES.filter(s => !activeTaxStates.includes(s.code))

  async function addState(code: string) {
    try {
      setError(null)
      await fetchWrapper.post('/api/finance/user-tax-states', { tax_year: year, state_code: code })
      onChange([...activeTaxStates, code])
      setAdding(false)
      setSelected('')
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to add state.')
    }
  }

  async function removeState(code: string) {
    try {
      setError(null)
      await fetchWrapper.delete(`/api/finance/user-tax-states/${code}?year=${year}`, undefined)
      onChange(activeTaxStates.filter(s => s !== code))
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to remove state.')
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">State returns:</span>
      {activeTaxStates.map(code => {
        const name = SUPPORTED_STATES.find(s => s.code === code)?.name ?? code
        return (
          <Badge key={code} variant="secondary" className="gap-1">
            {name}
            <button
              type="button"
              onClick={() => removeState(code)}
              className="ml-1 text-muted-foreground hover:text-foreground text-xs leading-none"
              aria-label={`Remove ${name}`}
            >
              ×
            </button>
          </Badge>
        )
      })}
      {availableToAdd.length > 0 && (
        adding ? (
          <div className="flex items-center gap-1">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {availableToAdd.map(s => (
                  <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" className="h-7 text-xs" disabled={!selected} onClick={() => selected && addState(selected)}>
              Add
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAdding(false); setSelected('') }}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(true)}>
            + Add state
          </Button>
        )
      )}
      {error && <p className="text-xs text-destructive w-full">{error}</p>}
    </div>
  )
}
