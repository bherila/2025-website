import { Briefcase } from 'lucide-react'
import { type ReactElement, useEffect, useId, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

import { listSavedCareerJobs } from './opportunityCostApi'
import type { JobSpec, OpportunityCostInputs, SavedCareerJob } from './types'

const CURRENT_SLOT = 'current'

interface SavedJobPickerProps {
  inputs: OpportunityCostInputs
  authenticated: boolean
  onApply: (inputs: OpportunityCostInputs) => void
}

interface SlotOption {
  value: string
  label: string
}

function slotOptions(inputs: OpportunityCostInputs): SlotOption[] {
  return [
    { value: CURRENT_SLOT, label: inputs.currentJob ? `Current: ${inputs.currentJob.name}` : 'Current job' },
    ...inputs.hypotheticalJobs.map((job, index) => ({ value: String(index), label: `Offer ${index + 1}: ${job.name}` })),
  ]
}

function applyToSlot(inputs: OpportunityCostInputs, target: string, spec: JobSpec): OpportunityCostInputs {
  if (target === CURRENT_SLOT) {
    return { ...inputs, currentJob: { ...spec, id: 'current' } }
  }

  const index = Number(target)
  return {
    ...inputs,
    hypotheticalJobs: inputs.hypotheticalJobs.map((job, slot) => (slot === index ? { ...spec, id: job.id } : job)),
  }
}

export function SavedJobPicker({ inputs, authenticated, onApply }: SavedJobPickerProps): ReactElement | null {
  const targetSelectId = useId()
  const [jobs, setJobs] = useState<SavedCareerJob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<string>(CURRENT_SLOT)
  const [applied, setApplied] = useState<string | null>(null)

  useEffect(() => {
    if (!authenticated) {
      return
    }

    let active = true
    setLoading(true)
    listSavedCareerJobs()
      .then((response) => {
        if (active) {
          setJobs(response.jobs)
          setError(null)
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [authenticated])

  if (!authenticated) {
    return (
      <section className="grid gap-2 rounded-md border border-dashed border-border bg-muted/20 p-4">
        <h2 className="text-base font-semibold text-foreground">Reuse a saved job</h2>
        <p className="text-sm text-muted-foreground">Log in to reuse jobs you have saved into the current slot or any offer.</p>
      </section>
    )
  }

  const options = slotOptions(inputs)
  const targetLabel = options.find((option) => option.value === target)?.label ?? 'Current job'

  function handleSelect(job: SavedCareerJob): void {
    onApply(applyToSlot(inputs, target, job.spec))
    setApplied(`Loaded “${job.name}” into ${targetLabel}.`)
  }

  return (
    <section className="grid gap-3 rounded-md border border-border bg-card p-4">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold text-foreground">Reuse a saved job</h2>
        <p className="text-sm text-muted-foreground">Load a previously saved job into a slot. The slot stays backed by your edits afterwards.</p>
      </div>

      <div className="grid gap-1">
        <Label htmlFor={targetSelectId}>Target slot</Label>
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger id={targetSelectId} aria-label="Target slot" className="w-full">
            <span className="truncate">{targetLabel}</span>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} sideOffset={4}>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading saved jobs…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No saved jobs yet. Save a comparison to reuse its jobs here.</p>
      ) : (
        <ul className="grid gap-2">
          {jobs.map((job) => (
            <li key={job.id}>
              <button
                type="button"
                onClick={() => handleSelect(job)}
                aria-label={`Load saved job ${job.name}`}
                className="flex w-full items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Briefcase className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{job.name}</span>
                <Badge variant="outline">{job.kind === 'current' ? 'Current' : 'Offer'}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}

      {applied ? <p className="text-sm text-muted-foreground">{applied}</p> : null}
    </section>
  )
}

export default SavedJobPicker
