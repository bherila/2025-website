import currency from 'currency.js'
import { Briefcase, Building2, type LucideIcon, Plus, Settings2, Trash2 } from 'lucide-react'
import { type ChangeEvent, type FocusEvent, type ReactElement, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import type { MillerRegistryEntry } from '@/components/ui/miller'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

import { buildDefaultJob, buildDefaultOptionGrant, buildDefaultRsuGrant } from './defaults'
import type { CareerCompInputs, JobSpec, OptionGrant, RsuGrant } from './types'

export type CareerCompFormSectionId = 'basics' | 'current-job' | 'offers'

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
}

interface CareerCompFormSectionProps extends CareerCompFormProps {
  section: CareerCompFormSectionId
}

interface NumberFieldProps {
  label: string
  value: number
  suffix?: string
  onChange: (value: number) => void
}

interface MoneyFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
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

function NumberField({ label, value, suffix, onChange }: NumberFieldProps): ReactElement {
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
        <InputGroupInput id={inputId} type="number" value={value} onChange={handleChange} onFocus={handleFocus} />
        {suffix ? <InputGroupAddon><InputGroupText>{suffix}</InputGroupText></InputGroupAddon> : null}
      </InputGroup>
    </div>
  )
}

function MoneyField({ label, value, onChange }: MoneyFieldProps): ReactElement {
  const inputId = useId()
  const [rawValue, setRawValue] = useState(String(value))

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setRawValue(event.target.value)
    onChange(parseMoney(event.target.value))
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>): void {
    event.target.select()
  }

  function handleBlur(): void {
    setRawValue(String(value))
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <InputGroup>
        <InputGroupAddon><InputGroupText>$</InputGroupText></InputGroupAddon>
        <InputGroupInput id={inputId} inputMode="decimal" value={rawValue} onBlur={handleBlur} onChange={handleChange} onFocus={handleFocus} />
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

function RsuGrantsEditor({ job, onChange }: { job: JobSpec; onChange: (job: JobSpec) => void }): ReactElement {
  function setGrants(rsuGrants: RsuGrant[]): void {
    onChange({ ...job, rsuGrants })
  }

  function updateGrant(grantId: string, patch: Partial<RsuGrant>): void {
    setGrants(job.rsuGrants.map((grant) => (grant.id === grantId ? { ...grant, ...patch } : grant)))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">RSU grants</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => setGrants([...job.rsuGrants, buildDefaultRsuGrant(job.id, job.rsuGrants.length + 1)])}>
          <Plus className="mr-1 size-3.5" /> Add RSU grant
        </Button>
      </div>
      {job.rsuGrants.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No RSU grants. Add one to model restricted stock vesting.</p>
      ) : (
        job.rsuGrants.map((grant) => (
          <div key={grant.id} className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{grant.id}</span>
              <Button type="button" variant="ghost" size="sm" aria-label={`Remove RSU grant ${grant.id}`} onClick={() => setGrants(job.rsuGrants.filter((entry) => entry.id !== grant.id))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Grant kind</Label>
                <Select value={grant.kind} onValueChange={(value) => updateGrant(grant.id, { kind: value === 'refresher' ? 'refresher' : 'hire' })}>
                  <SelectTrigger>{grant.kind === 'refresher' ? 'Refresher' : 'New hire'}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hire">New hire</SelectItem>
                    <SelectItem value="refresher">Refresher</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DateField label="Grant date" value={grant.grantDate} onChange={(value) => updateGrant(grant.id, { grantDate: value })} />
              <NumberField label="Share count" value={grant.shareCount ?? 0} onChange={(value) => updateGrant(grant.id, { shareCount: value })} />
              <MoneyField label="Grant value (optional)" value={grant.grantValue ?? 0} onChange={(value) => updateGrant(grant.id, { grantValue: value > 0 ? value : undefined })} />
              <MoneyField label="Grant price (optional)" value={grant.grantPrice ?? 0} onChange={(value) => updateGrant(grant.id, { grantPrice: value > 0 ? value : undefined })} />
              <NumberField label="Cliff months" value={grant.cliffMonths} onChange={(value) => updateGrant(grant.id, { cliffMonths: value })} />
              <NumberField label="Vesting years" value={grant.vestingYears} onChange={(value) => updateGrant(grant.id, { vestingYears: value })} />
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function OptionGrantsEditor({ job, onChange }: { job: JobSpec; onChange: (job: JobSpec) => void }): ReactElement {
  function setGrants(optionGrants: OptionGrant[]): void {
    onChange({ ...job, optionGrants })
  }

  function updateGrant(grantId: string, patch: Partial<OptionGrant>): void {
    setGrants(job.optionGrants.map((grant) => (grant.id === grantId ? { ...grant, ...patch } : grant)))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Option grants (ISO / NSO)</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => setGrants([...job.optionGrants, buildDefaultOptionGrant(job.id, job.optionGrants.length + 1)])}>
          <Plus className="mr-1 size-3.5" /> Add option grant
        </Button>
      </div>
      {job.optionGrants.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No option grants. Add one to model ISO/NSO vesting and exercise.</p>
      ) : (
        job.optionGrants.map((grant) => (
          <div key={grant.id} className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{grant.id}</span>
              <Button type="button" variant="ghost" size="sm" aria-label={`Remove option grant ${grant.id}`} onClick={() => setGrants(job.optionGrants.filter((entry) => entry.id !== grant.id))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Grant kind</Label>
                <Select value={grant.kind} onValueChange={(value) => updateGrant(grant.id, { kind: value === 'refresher' ? 'refresher' : 'hire' })}>
                  <SelectTrigger>{grant.kind === 'refresher' ? 'Refresher' : 'New hire'}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hire">New hire</SelectItem>
                    <SelectItem value="refresher">Refresher</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Option type</Label>
                <Select value={grant.type} onValueChange={(value) => updateGrant(grant.id, { type: value === 'nso' ? 'nso' : 'iso' })}>
                  <SelectTrigger>{grant.type === 'nso' ? 'NSO' : 'ISO'}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="iso">ISO</SelectItem>
                    <SelectItem value="nso">NSO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DateField label="Grant date" value={grant.grantDate} onChange={(value) => updateGrant(grant.id, { grantDate: value })} />
              <NumberField label="Share count" value={grant.shareCount} onChange={(value) => updateGrant(grant.id, { shareCount: value })} />
              <MoneyField label="Strike price" value={grant.strike} onChange={(value) => updateGrant(grant.id, { strike: value })} />
              <NumberField label="Cliff months" value={grant.cliffMonths} onChange={(value) => updateGrant(grant.id, { cliffMonths: value })} />
              <NumberField label="Vesting years" value={grant.vestingYears} onChange={(value) => updateGrant(grant.id, { vestingYears: value })} />
              <div className="space-y-2">
                <Label>83(b) early exercise</Label>
                <Select value={grant.earlyExercise83b ? 'yes' : 'no'} onValueChange={(value) => updateGrant(grant.id, { earlyExercise83b: value === 'yes' })}>
                  <SelectTrigger>{grant.earlyExercise83b ? 'Yes' : 'No'}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function updateJob(inputs: CareerCompInputs, jobId: string, updater: (job: JobSpec) => JobSpec): CareerCompInputs {
  if (inputs.currentJob?.id === jobId) {
    return { ...inputs, currentJob: updater(inputs.currentJob) }
  }

  return {
    ...inputs,
    hypotheticalJobs: inputs.hypotheticalJobs.map((job) => (job.id === jobId ? updater(job) : job)),
  }
}

function JobEditor({ job, onChange, onRemove }: { job: JobSpec; onChange: (job: JobSpec) => void; onRemove?: (() => void) | undefined }): ReactElement {
  const nameId = useId()

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">{job.name}</CardTitle>
          <CardDescription>{job.company.type === 'private' ? 'Private company inputs include 409A, dilution, and liquidity date.' : 'Public company inputs use current share price.'}</CardDescription>
        </div>
        {onRemove ? <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${job.name}`} onClick={onRemove}><Trash2 className="size-4" /></Button> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={nameId}>Job name</Label>
            <Input id={nameId} value={job.name} onChange={(event) => onChange({ ...job, name: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Company type</Label>
            <Select value={job.company.type} onValueChange={(value) => onChange({ ...job, company: { ...job.company, type: value === 'private' ? 'private' : 'public' } })}>
              <SelectTrigger>{job.company.type === 'private' ? 'Private' : 'Public'}</SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <MoneyField label="Base salary" value={job.comp.baseSalary} onChange={(value) => onChange({ ...job, comp: { ...job.comp, baseSalary: value } })} />
          <MoneyField label="Cash bonus" value={job.comp.cashBonus} onChange={(value) => onChange({ ...job, comp: { ...job.comp, cashBonus: value } })} />
          <MoneyField label="Current share price" value={job.company.currentSharePrice} onChange={(value) => onChange({ ...job, company: { ...job.company, currentSharePrice: value } })} />
          <MoneyField label="409A price" value={job.company.fourNineA} onChange={(value) => onChange({ ...job, company: { ...job.company, fourNineA: value } })} />
          <NumberField label="Fully diluted shares" value={job.company.fullyDilutedShares} onChange={(value) => onChange({ ...job, company: { ...job.company, fullyDilutedShares: value } })} />
          <NumberField label="Annual dilution" value={job.company.annualDilutionPct} suffix="%" onChange={(value) => onChange({ ...job, company: { ...job.company, annualDilutionPct: value } })} />
          <NumberField label="Low growth" value={job.growthBands.lowPct} suffix="%" onChange={(value) => onChange({ ...job, growthBands: { ...job.growthBands, lowPct: value } })} />
          <NumberField label="Medium growth" value={job.growthBands.mediumPct} suffix="%" onChange={(value) => onChange({ ...job, growthBands: { ...job.growthBands, mediumPct: value } })} />
          <NumberField label="High growth" value={job.growthBands.highPct} suffix="%" onChange={(value) => onChange({ ...job, growthBands: { ...job.growthBands, highPct: value } })} />
          <DateField label="Liquidity date" value={job.company.liquidityDate ?? ''} onChange={(value) => onChange({ ...job, company: { ...job.company, liquidityDate: value || null } })} />
        </div>

        <div className="space-y-4 border-t pt-4">
          <RsuGrantsEditor job={job} onChange={onChange} />
          <OptionGrantsEditor job={job} onChange={onChange} />
        </div>
      </CardContent>
    </Card>
  )
}

export function CareerCompFormSection({ inputs, section, onChange }: CareerCompFormSectionProps): ReactElement {
  if (section === 'basics') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Planning window</CardTitle>
          <CardDescription>Choose the calendar start year and comparison horizon.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Start year" value={inputs.startYear} onChange={(value) => onChange({ ...inputs, startYear: value })} />
          <NumberField label="Horizon" value={inputs.horizonYears} suffix="years" onChange={(value) => onChange({ ...inputs, horizonYears: value })} />
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

export function CareerCompForm(props: CareerCompFormProps): ReactElement {
  return (
    <div className="space-y-4">
      {CAREER_COMP_FORM_SECTIONS.map((section) => (
        <CareerCompFormSection key={section.id} {...props} section={section.id} />
      ))}
    </div>
  )
}
