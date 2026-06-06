import currency from 'currency.js'
import { Briefcase, Building2, Copy, type LucideIcon, Pencil, Plus, Settings2, Trash2 } from 'lucide-react'
import { type ChangeEvent, type FocusEvent, type ReactElement, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import type { MillerRegistryEntry } from '@/components/ui/miller'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

import { buildDefaultJob, buildDefaultOptionGrant, buildDefaultRsuGrant } from './defaults'
import type { CareerCompInputs, JobSpec, OptionGrant, RsuGrant, VestingFrequency } from './types'

export type CareerCompFormSectionId = 'basics' | 'current-job' | 'offers'

export type GrantType = 'rsu' | 'opt'

/** Opens a dedicated Miller column to add (no grantId) or edit (with grantId) a single grant. */
export type OpenGrantEditor = (jobId: string, grantType: GrantType, grantId?: string) => void

export interface CareerCompFormSectionMeta {
  id: CareerCompFormSectionId
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  presentation: 'column'
  component: MillerRegistryEntry<unknown, CareerCompFormSectionId>['component']
  meta: {
    description: string
    icon: LucideIcon
  }
}

interface CareerCompFormProps {
  inputs: CareerCompInputs
  onChange: (inputs: CareerCompInputs) => void
  onOpenGrantEditor: OpenGrantEditor
}

interface CareerCompFormSectionProps extends CareerCompFormProps {
  section: CareerCompFormSectionId
}

interface NumberFieldProps {
  label: string
  value: number
  suffix?: string
  min?: number
  onChange: (value: number) => void
}

interface MoneyFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
}

interface SelectOption<T extends string> {
  value: T
  label: string
}

const VESTING_FREQUENCY_OPTIONS: SelectOption<VestingFrequency>[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
]

const GRANT_KIND_OPTIONS: SelectOption<'hire' | 'refresher'>[] = [
  { value: 'hire', label: 'New hire' },
  { value: 'refresher', label: 'Refresher' },
]

const OPTION_TYPE_OPTIONS: SelectOption<'iso' | 'nso'>[] = [
  { value: 'iso', label: 'ISO' },
  { value: 'nso', label: 'NSO' },
]

const COMPANY_TYPE_OPTIONS: SelectOption<'public' | 'private'>[] = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
]

const YES_NO_OPTIONS: SelectOption<'yes' | 'no'>[] = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
]

function frequencyLabel(frequency: VestingFrequency): string {
  return VESTING_FREQUENCY_OPTIONS.find((option) => option.value === frequency)?.label ?? 'Monthly'
}

function formatShares(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : '0'
}

export function notRenderedViaMillerShell(): never {
  throw new Error('CareerComp does not render via MillerRegistryShell')
}

export const CAREER_COMP_FORM_SECTIONS: CareerCompFormSectionMeta[] = [
  {
    id: 'basics',
    label: 'Planning window',
    shortLabel: 'Window',
    description: 'Start year and horizon for every job comparison.',
    icon: Settings2,
    presentation: 'column',
    component: notRenderedViaMillerShell,
    meta: { description: 'Start year and horizon for every job comparison.', icon: Settings2 },
  },
  {
    id: 'current-job',
    label: 'Current job',
    shortLabel: 'Current',
    description: 'Optional baseline job. Leave empty for a no-current-job comparison.',
    icon: Briefcase,
    presentation: 'column',
    component: notRenderedViaMillerShell,
    meta: { description: 'Optional baseline job. Leave empty for a no-current-job comparison.', icon: Briefcase },
  },
  {
    id: 'offers',
    label: 'Hypothetical offers',
    shortLabel: 'Offers',
    description: 'One or more offers to compare against the baseline.',
    icon: Building2,
    presentation: 'column',
    component: notRenderedViaMillerShell,
    meta: { description: 'One or more offers to compare against the baseline.', icon: Building2 },
  },
]

function parseNumber(raw: string): number {
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseMoney(raw: string): number {
  return currency(raw).value
}

/** Stable, collision-free id for a freshly added or duplicated grant within a job. */
function nextGrantId(existing: { id: string }[], jobId: string, kind: 'rsu' | 'opt'): string {
  const used = new Set(existing.map((grant) => grant.id))
  let ordinal = existing.length + 1
  let id = `${jobId}-${kind}-${ordinal}`
  while (used.has(id)) {
    ordinal += 1
    id = `${jobId}-${kind}-${ordinal}`
  }
  return id
}

function NumberField({ label, value, suffix, min, onChange }: NumberFieldProps): ReactElement {
  const inputId = useId()

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(parseNumber(event.target.value))
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>): void {
    event.target.select()
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <InputGroup>
        <InputGroupInput id={inputId} type="number" min={min} value={value} onChange={handleChange} onFocus={handleFocus} />
        {suffix ? <InputGroupAddon><InputGroupText>{suffix}</InputGroupText></InputGroupAddon> : null}
      </InputGroup>
    </div>
  )
}

function MoneyField({ label, value, onChange }: MoneyFieldProps): ReactElement {
  const inputId = useId()
  // While focused we show the user's in-progress text (`draft`); otherwise we mirror the prop so
  // that loading a share link, applying a saved job, or switching offers refreshes the display
  // instead of leaving a stale value frozen from first render.
  const [draft, setDraft] = useState<string | null>(null)

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setDraft(event.target.value)
    onChange(parseMoney(event.target.value))
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>): void {
    event.target.select()
  }

  function handleBlur(): void {
    setDraft(null)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <InputGroup>
        <InputGroupAddon><InputGroupText>$</InputGroupText></InputGroupAddon>
        <InputGroupInput id={inputId} inputMode="decimal" value={draft ?? String(value)} onBlur={handleBlur} onChange={handleChange} onFocus={handleFocus} />
      </InputGroup>
    </div>
  )
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): ReactElement {
  const inputId = useId()

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input id={inputId} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function SelectField<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
}): ReactElement {
  const labelId = useId()
  const triggerId = useId()
  const selected = options.find((option) => option.value === value)

  return (
    <div className="space-y-2">
      <Label id={labelId} htmlFor={triggerId}>{label}</Label>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={triggerId} aria-labelledby={labelId}>{selected?.label ?? value}</SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function rsuGrantSummary(grant: RsuGrant): string {
  return `${grant.kind === 'refresher' ? 'Refresher' : 'New hire'} · ${formatShares(grant.shareCount ?? 0)} sh · ${grant.vestingYears}yr ${frequencyLabel(grant.vestingFrequency).toLowerCase()} · ${grant.cliffMonths}mo cliff`
}

function optionGrantSummary(grant: OptionGrant): string {
  return `${grant.type.toUpperCase()} · ${formatShares(grant.shareCount)} sh @ $${grant.strike} · ${grant.vestingYears}yr ${frequencyLabel(grant.vestingFrequency).toLowerCase()}`
}

/** Compact, clickable list row for a grant. Editing happens in a dedicated Miller column. */
function GrantRow({ title, summary, onEdit, onDuplicate, onRemove }: {
  title: string
  summary: string
  onEdit: () => void
  onDuplicate: () => void
  onRemove: () => void
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border p-3">
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left focus-visible:outline-none">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{summary}</p>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="sm" aria-label={`Edit ${title}`} onClick={onEdit}>
          <Pencil className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" aria-label={`Duplicate ${title}`} onClick={onDuplicate}>
          <Copy className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${title}`} onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// New grants inherit the previous grant's vesting schedule so refreshers need only a date + size.
function buildNewRsuGrant(job: JobSpec): RsuGrant {
  const previous = job.rsuGrants[job.rsuGrants.length - 1]
  const base = buildDefaultRsuGrant(job.id, job.rsuGrants.length + 1)
  return previous
    ? { ...base, id: nextGrantId(job.rsuGrants, job.id, 'rsu'), kind: 'refresher', cliffMonths: previous.cliffMonths, vestingYears: previous.vestingYears, vestingFrequency: previous.vestingFrequency, grantPrice: previous.grantPrice }
    : base
}

function buildNewOptionGrant(job: JobSpec): OptionGrant {
  const previous = job.optionGrants[job.optionGrants.length - 1]
  const base = buildDefaultOptionGrant(job.id, job.optionGrants.length + 1)
  return previous
    ? { ...base, id: nextGrantId(job.optionGrants, job.id, 'opt'), kind: 'refresher', type: previous.type, strike: previous.strike, cliffMonths: previous.cliffMonths, vestingYears: previous.vestingYears, vestingFrequency: previous.vestingFrequency, earlyExercise83b: previous.earlyExercise83b }
    : base
}

function RsuGrantsList({ job, onChange, onOpenGrantEditor }: { job: JobSpec; onChange: (job: JobSpec) => void; onOpenGrantEditor: OpenGrantEditor }): ReactElement {
  function setGrants(rsuGrants: RsuGrant[]): void {
    onChange({ ...job, rsuGrants })
  }

  function duplicateGrant(index: number): void {
    const original = job.rsuGrants[index]
    if (!original) {
      return
    }
    const next = [...job.rsuGrants]
    next.splice(index + 1, 0, { ...original, id: nextGrantId(job.rsuGrants, job.id, 'rsu') })
    setGrants(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">RSU grants</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenGrantEditor(job.id, 'rsu')}>
          <Plus className="mr-1 size-3.5" /> Add RSU grant
        </Button>
      </div>
      {job.rsuGrants.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No RSU grants. Add one to model restricted stock vesting.</p>
      ) : (
        job.rsuGrants.map((grant, index) => (
          <GrantRow
            key={grant.id}
            title={`RSU grant ${index + 1}`}
            summary={rsuGrantSummary(grant)}
            onEdit={() => onOpenGrantEditor(job.id, 'rsu', grant.id)}
            onDuplicate={() => duplicateGrant(index)}
            onRemove={() => setGrants(job.rsuGrants.filter((entry) => entry.id !== grant.id))}
          />
        ))
      )}
    </div>
  )
}

function OptionGrantsList({ job, onChange, onOpenGrantEditor }: { job: JobSpec; onChange: (job: JobSpec) => void; onOpenGrantEditor: OpenGrantEditor }): ReactElement {
  function setGrants(optionGrants: OptionGrant[]): void {
    onChange({ ...job, optionGrants })
  }

  function duplicateGrant(index: number): void {
    const original = job.optionGrants[index]
    if (!original) {
      return
    }
    const next = [...job.optionGrants]
    next.splice(index + 1, 0, { ...original, id: nextGrantId(job.optionGrants, job.id, 'opt') })
    setGrants(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Option grants (ISO / NSO)</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenGrantEditor(job.id, 'opt')}>
          <Plus className="mr-1 size-3.5" /> Add option grant
        </Button>
      </div>
      {job.optionGrants.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No option grants. Add one to model ISO/NSO vesting and exercise.</p>
      ) : (
        job.optionGrants.map((grant, index) => (
          <GrantRow
            key={grant.id}
            title={`Option grant ${index + 1}`}
            summary={optionGrantSummary(grant)}
            onEdit={() => onOpenGrantEditor(job.id, 'opt', grant.id)}
            onDuplicate={() => duplicateGrant(index)}
            onRemove={() => setGrants(job.optionGrants.filter((entry) => entry.id !== grant.id))}
          />
        ))
      )}
    </div>
  )
}

export function updateJob(inputs: CareerCompInputs, jobId: string, updater: (job: JobSpec) => JobSpec): CareerCompInputs {
  if (inputs.currentJob?.id === jobId) {
    return { ...inputs, currentJob: updater(inputs.currentJob) }
  }

  return {
    ...inputs,
    hypotheticalJobs: inputs.hypotheticalJobs.map((job) => (job.id === jobId ? updater(job) : job)),
  }
}

function findJob(inputs: CareerCompInputs, jobId: string): JobSpec | null {
  if (inputs.currentJob?.id === jobId) {
    return inputs.currentJob
  }

  return inputs.hypotheticalJobs.find((job) => job.id === jobId) ?? null
}

function RsuGrantFields({ grant, onChange }: { grant: RsuGrant; onChange: (patch: Partial<RsuGrant>) => void }): ReactElement {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField label="Grant kind" value={grant.kind} options={GRANT_KIND_OPTIONS} onChange={(kind) => onChange({ kind })} />
      <DateField label="Grant date" value={grant.grantDate} onChange={(value) => onChange({ grantDate: value })} />
      <NumberField label="Share count" value={grant.shareCount ?? 0} min={0} onChange={(value) => onChange({ shareCount: value })} />
      <MoneyField label="Grant value (optional)" value={grant.grantValue ?? 0} onChange={(value) => onChange({ grantValue: value > 0 ? value : undefined })} />
      <MoneyField label="Grant price (optional)" value={grant.grantPrice ?? 0} onChange={(value) => onChange({ grantPrice: value > 0 ? value : undefined })} />
      <NumberField label="Cliff months" value={grant.cliffMonths} min={0} onChange={(value) => onChange({ cliffMonths: value })} />
      <NumberField label="Vesting years" value={grant.vestingYears} min={0} onChange={(value) => onChange({ vestingYears: value })} />
      <SelectField label="Vesting frequency" value={grant.vestingFrequency ?? 'monthly'} options={VESTING_FREQUENCY_OPTIONS} onChange={(vestingFrequency) => onChange({ vestingFrequency })} />
    </div>
  )
}

function OptionGrantFields({ grant, onChange }: { grant: OptionGrant; onChange: (patch: Partial<OptionGrant>) => void }): ReactElement {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField label="Grant kind" value={grant.kind} options={GRANT_KIND_OPTIONS} onChange={(kind) => onChange({ kind })} />
      <SelectField label="Option type" value={grant.type} options={OPTION_TYPE_OPTIONS} onChange={(type) => onChange({ type })} />
      <DateField label="Grant date" value={grant.grantDate} onChange={(value) => onChange({ grantDate: value })} />
      <NumberField label="Share count" value={grant.shareCount} min={0} onChange={(value) => onChange({ shareCount: value })} />
      <MoneyField label="Strike price" value={grant.strike} onChange={(value) => onChange({ strike: value })} />
      <NumberField label="Cliff months" value={grant.cliffMonths} min={0} onChange={(value) => onChange({ cliffMonths: value })} />
      <NumberField label="Vesting years" value={grant.vestingYears} min={0} onChange={(value) => onChange({ vestingYears: value })} />
      <SelectField label="Vesting frequency" value={grant.vestingFrequency ?? 'monthly'} options={VESTING_FREQUENCY_OPTIONS} onChange={(vestingFrequency) => onChange({ vestingFrequency })} />
      <SelectField label="83(b) early exercise" value={grant.earlyExercise83b ? 'yes' : 'no'} options={YES_NO_OPTIONS} onChange={(value) => onChange({ earlyExercise83b: value === 'yes' })} />
    </div>
  )
}

/**
 * Adds (no `grantId`) or edits one grant in its own Miller column. Edits are written into the job
 * only on Save, then the column closes; Cancel discards the draft.
 */
export function GrantEditorColumn({ inputs, jobId, grantType, grantId, onChange, onClose }: {
  inputs: CareerCompInputs
  jobId: string
  grantType: GrantType
  grantId?: string | undefined
  onChange: (inputs: CareerCompInputs) => void
  onClose: () => void
}): ReactElement {
  const job = findJob(inputs, jobId)

  // Build the draft once when the column opens; later input changes must not reset in-progress edits.
  const [draft, setDraft] = useState<RsuGrant | OptionGrant | null>(() => {
    if (!job) {
      return null
    }
    if (grantType === 'rsu') {
      return (grantId ? job.rsuGrants.find((grant) => grant.id === grantId) : undefined) ?? buildNewRsuGrant(job)
    }
    return (grantId ? job.optionGrants.find((grant) => grant.id === grantId) : undefined) ?? buildNewOptionGrant(job)
  })

  if (!job || !draft) {
    return <p className="text-sm text-muted-foreground">This grant is no longer available.</p>
  }

  const isNew = !grantId
  const heading = grantType === 'rsu' ? (isNew ? 'Add RSU grant' : 'Edit RSU grant') : isNew ? 'Add option grant' : 'Edit option grant'

  function saveGrant(): void {
    if (!draft) {
      return
    }

    onChange(updateJob(inputs, jobId, (current) => {
      if (grantType === 'rsu') {
        const grant = draft as RsuGrant
        const exists = current.rsuGrants.some((entry) => entry.id === grant.id)
        return { ...current, rsuGrants: exists ? current.rsuGrants.map((entry) => (entry.id === grant.id ? grant : entry)) : [...current.rsuGrants, grant] }
      }

      const grant = draft as OptionGrant
      const exists = current.optionGrants.some((entry) => entry.id === grant.id)
      return { ...current, optionGrants: exists ? current.optionGrants.map((entry) => (entry.id === grant.id ? grant : entry)) : [...current.optionGrants, grant] }
    }))
    onClose()
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">{heading}</p>
        <p className="text-xs text-muted-foreground">{job.name}</p>
      </div>
      {grantType === 'rsu' ? (
        <RsuGrantFields grant={draft as RsuGrant} onChange={(patch) => setDraft((current) => (current ? { ...current, ...patch } : current))} />
      ) : (
        <OptionGrantFields grant={draft as OptionGrant} onChange={(patch) => setDraft((current) => (current ? { ...current, ...patch } : current))} />
      )}
      <div className="flex items-center gap-2">
        <Button type="button" onClick={saveGrant}>Save grant</Button>
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  )
}

function JobEditor({ job, onChange, onRemove, onOpenGrantEditor }: { job: JobSpec; onChange: (job: JobSpec) => void; onRemove?: (() => void) | undefined; onOpenGrantEditor: OpenGrantEditor }): ReactElement {
  const nameId = useId()
  const isPrivate = job.company.type === 'private'

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">{job.name}</CardTitle>
          <CardDescription>{isPrivate ? 'Private company inputs include 409A, dilution, and liquidity date.' : 'Public company inputs use current share price.'}</CardDescription>
        </div>
        {onRemove ? <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${job.name}`} onClick={onRemove}><Trash2 className="size-4" /></Button> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={nameId}>Job name</Label>
            <Input id={nameId} value={job.name} onChange={(event) => onChange({ ...job, name: event.target.value })} />
          </div>
          <SelectField label="Company type" value={job.company.type} options={COMPANY_TYPE_OPTIONS} onChange={(type) => onChange({ ...job, company: { ...job.company, type } })} />
          <MoneyField label="Base salary" value={job.comp.baseSalary} onChange={(value) => onChange({ ...job, comp: { ...job.comp, baseSalary: value } })} />
          <MoneyField label="Cash bonus" value={job.comp.cashBonus} onChange={(value) => onChange({ ...job, comp: { ...job.comp, cashBonus: value } })} />
          {isPrivate ? (
            <>
              <MoneyField label="409A price" value={job.company.fourNineA} onChange={(value) => onChange({ ...job, company: { ...job.company, fourNineA: value } })} />
              <NumberField label="Annual dilution" value={job.company.annualDilutionPct} suffix="%" min={0} onChange={(value) => onChange({ ...job, company: { ...job.company, annualDilutionPct: value } })} />
              <DateField label="Liquidity date" value={job.company.liquidityDate ?? ''} onChange={(value) => onChange({ ...job, company: { ...job.company, liquidityDate: value || null } })} />
            </>
          ) : (
            <MoneyField label="Current share price" value={job.company.currentSharePrice} onChange={(value) => onChange({ ...job, company: { ...job.company, currentSharePrice: value } })} />
          )}
          <NumberField label="Low growth" value={job.growthBands.lowPct} suffix="%" onChange={(value) => onChange({ ...job, growthBands: { ...job.growthBands, lowPct: value } })} />
          <NumberField label="Medium growth" value={job.growthBands.mediumPct} suffix="%" onChange={(value) => onChange({ ...job, growthBands: { ...job.growthBands, mediumPct: value } })} />
          <NumberField label="High growth" value={job.growthBands.highPct} suffix="%" onChange={(value) => onChange({ ...job, growthBands: { ...job.growthBands, highPct: value } })} />
        </div>

        <div className="space-y-4 border-t pt-4">
          <RsuGrantsList job={job} onChange={onChange} onOpenGrantEditor={onOpenGrantEditor} />
          <OptionGrantsList job={job} onChange={onChange} onOpenGrantEditor={onOpenGrantEditor} />
        </div>
      </CardContent>
    </Card>
  )
}

export function CareerCompFormSection({ inputs, section, onChange, onOpenGrantEditor }: CareerCompFormSectionProps): ReactElement {
  if (section === 'basics') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Planning window</CardTitle>
          <CardDescription>Choose the calendar start year and comparison horizon.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Start year" value={inputs.startYear} min={2000} onChange={(value) => onChange({ ...inputs, startYear: value })} />
          <NumberField label="Horizon" value={inputs.horizonYears} suffix="years" min={1} onChange={(value) => onChange({ ...inputs, horizonYears: value })} />
        </CardContent>
      </Card>
    )
  }

  if (section === 'current-job') {
    return (
      <div className="space-y-4">
        {inputs.currentJob ? (
          <JobEditor
            job={inputs.currentJob}
            onChange={(job) => onChange(updateJob(inputs, inputs.currentJob?.id ?? 'current', () => job))}
            onRemove={() => onChange({ ...inputs, currentJob: null })}
            onOpenGrantEditor={onOpenGrantEditor}
          />
        ) : (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No current job</CardTitle>
              <CardDescription>Deltas will be hidden until you add a current job baseline.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" onClick={() => onChange({ ...inputs, currentJob: buildDefaultJob('current', 'Current job') })}>Add current job</Button>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {inputs.hypotheticalJobs.map((job) => (
        <JobEditor
          key={job.id}
          job={job}
          onChange={(nextJob) => onChange(updateJob(inputs, job.id, () => nextJob))}
          onRemove={inputs.hypotheticalJobs.length > 1 ? () => onChange({ ...inputs, hypotheticalJobs: inputs.hypotheticalJobs.filter((entry) => entry.id !== job.id) }) : undefined}
          onOpenGrantEditor={onOpenGrantEditor}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => onChange({ ...inputs, hypotheticalJobs: [...inputs.hypotheticalJobs, buildDefaultJob(`hyp-${inputs.hypotheticalJobs.length + 1}`, `Offer ${inputs.hypotheticalJobs.length + 1}`)] })}
      >
        <Plus className="mr-2 size-4" /> Add offer
      </Button>
    </div>
  )
}
