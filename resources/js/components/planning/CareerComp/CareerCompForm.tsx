import currency from 'currency.js'
import { Briefcase, Building2, ChevronRight, Copy, LineChart, type LucideIcon, Pencil, Plus, Settings2, Trash2 } from 'lucide-react'
import { type ChangeEvent, type FocusEvent, type KeyboardEvent, type ReactElement, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import type { MillerRegistryEntry } from '@/components/ui/miller'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

import { buildDefaultJob, buildDefaultOptionGrant, buildDefaultRsuGrant, DEFAULT_MODEL_ASSUMPTIONS } from './defaults'
import { formatMoney } from './formatters'
import type { CareerCompInputs, JobSpec, ModelAssumptions, OptionGrant, RsuGrant, ValuationScenario, ValuationScenarioStage, VestingFrequency, VestingSchedule } from './types'

export type CareerCompFormSectionId = 'basics' | 'model-assumptions' | 'current-job' | 'offers'

export type GrantType = 'rsu' | 'opt'

/** Opens a dedicated Miller column to add (no grantId) or edit (with grantId) a single grant. */
export type OpenGrantEditor = (jobId: string, grantType: GrantType, grantId?: string) => void
export type OpenValuationTimeline = (jobId: string) => void

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

interface ActiveGrantSelection {
  jobId: string
  grantType: GrantType
  grantId?: string | undefined
}

interface CareerCompFormProps {
  inputs: CareerCompInputs
  onChange: (inputs: CareerCompInputs) => void
  onOpenGrantEditor: OpenGrantEditor
  onOpenValuationTimeline: OpenValuationTimeline
  activeGrant?: ActiveGrantSelection | null | undefined
}

interface CareerCompFormSectionProps extends CareerCompFormProps {
  section: CareerCompFormSectionId
}

interface NumberFieldProps {
  label: string
  value: number
  suffix?: string
  min?: number
  max?: number
  compact?: boolean
  onChange: (value: number) => void
}

interface MoneyFieldProps {
  label: string
  value: number
  compact?: boolean
  onChange: (value: number) => void
}

interface SelectOption<T extends string> {
  value: T
  label: string
}

type VestingSchedulePresetId =
  | 'four-year-monthly-one-year-cliff'
  | 'four-year-quarterly-one-year-cliff'
  | 'four-year-annual-one-year-cliff'
  | 'four-year-monthly-no-cliff'
  | 'four-year-quarterly-no-cliff'
  | 'three-year-monthly-no-cliff'
  | 'annual-40-30-20-10'
  | 'custom'

type GrantVestingSchedule = NonNullable<VestingSchedule>

interface VestingSchedulePreset {
  label: string
  cliffMonths: number
  vestingYears: number
  vestingFrequency: VestingFrequency
  vestingSchedule: GrantVestingSchedule | null
}

type VestingSchedulePatch = Pick<RsuGrant, 'cliffMonths' | 'vestingYears' | 'vestingFrequency' | 'vestingSchedule'>

const VESTING_FREQUENCY_OPTIONS: SelectOption<VestingFrequency>[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
]

const VESTING_SCHEDULE_PRESETS: Record<Exclude<VestingSchedulePresetId, 'custom'>, VestingSchedulePreset> = {
  'four-year-monthly-one-year-cliff': {
    label: '4-year monthly, 1-year cliff',
    cliffMonths: 12,
    vestingYears: 4,
    vestingFrequency: 'monthly',
    vestingSchedule: { type: 'linear', presetId: 'four-year-monthly-one-year-cliff', durationMonths: 48, cliffMonths: 12, frequency: 'monthly' },
  },
  'four-year-quarterly-one-year-cliff': {
    label: '4-year quarterly, 1-year cliff',
    cliffMonths: 12,
    vestingYears: 4,
    vestingFrequency: 'quarterly',
    vestingSchedule: { type: 'linear', presetId: 'four-year-quarterly-one-year-cliff', durationMonths: 48, cliffMonths: 12, frequency: 'quarterly' },
  },
  'four-year-annual-one-year-cliff': {
    label: '4-year annual, 1-year cliff',
    cliffMonths: 12,
    vestingYears: 4,
    vestingFrequency: 'annual',
    vestingSchedule: { type: 'linear', presetId: 'four-year-annual-one-year-cliff', durationMonths: 48, cliffMonths: 12, frequency: 'annual' },
  },
  'four-year-monthly-no-cliff': {
    label: '4-year monthly, no cliff',
    cliffMonths: 0,
    vestingYears: 4,
    vestingFrequency: 'monthly',
    vestingSchedule: { type: 'linear', presetId: 'four-year-monthly-no-cliff', durationMonths: 48, cliffMonths: 0, frequency: 'monthly' },
  },
  'four-year-quarterly-no-cliff': {
    label: '4-year quarterly, no cliff',
    cliffMonths: 0,
    vestingYears: 4,
    vestingFrequency: 'quarterly',
    vestingSchedule: { type: 'linear', presetId: 'four-year-quarterly-no-cliff', durationMonths: 48, cliffMonths: 0, frequency: 'quarterly' },
  },
  'three-year-monthly-no-cliff': {
    label: '3-year monthly, no cliff',
    cliffMonths: 0,
    vestingYears: 3,
    vestingFrequency: 'monthly',
    vestingSchedule: { type: 'linear', presetId: 'three-year-monthly-no-cliff', durationMonths: 36, cliffMonths: 0, frequency: 'monthly' },
  },
  'annual-40-30-20-10': {
    label: '40/30/20/10 annual',
    cliffMonths: 12,
    vestingYears: 4,
    vestingFrequency: 'annual',
    vestingSchedule: {
      type: 'tranches',
      presetId: 'annual-40-30-20-10',
      tranches: [
        { month: 12, percent: 40 },
        { month: 24, percent: 30 },
        { month: 36, percent: 20 },
        { month: 48, percent: 10 },
      ],
    },
  },
}

const VESTING_SCHEDULE_OPTIONS: SelectOption<VestingSchedulePresetId>[] = [
  { value: 'four-year-monthly-one-year-cliff', label: VESTING_SCHEDULE_PRESETS['four-year-monthly-one-year-cliff'].label },
  { value: 'four-year-quarterly-one-year-cliff', label: VESTING_SCHEDULE_PRESETS['four-year-quarterly-one-year-cliff'].label },
  { value: 'four-year-annual-one-year-cliff', label: VESTING_SCHEDULE_PRESETS['four-year-annual-one-year-cliff'].label },
  { value: 'four-year-monthly-no-cliff', label: VESTING_SCHEDULE_PRESETS['four-year-monthly-no-cliff'].label },
  { value: 'four-year-quarterly-no-cliff', label: VESTING_SCHEDULE_PRESETS['four-year-quarterly-no-cliff'].label },
  { value: 'three-year-monthly-no-cliff', label: VESTING_SCHEDULE_PRESETS['three-year-monthly-no-cliff'].label },
  { value: 'annual-40-30-20-10', label: VESTING_SCHEDULE_PRESETS['annual-40-30-20-10'].label },
  { value: 'custom', label: 'Custom / manual fields' },
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

const VALUATION_OUTCOME_OPTIONS: SelectOption<'low' | 'medium' | 'high'>[] = [
  { value: 'medium', label: 'Base / medium' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
]

const FILING_STATUS_OPTIONS: SelectOption<'single' | 'mfj'>[] = [
  { value: 'single', label: 'Single' },
  { value: 'mfj', label: 'Married filing jointly' },
]

function frequencyLabel(frequency: VestingFrequency): string {
  return VESTING_FREQUENCY_OPTIONS.find((option) => option.value === frequency)?.label ?? 'Monthly'
}

function vestingSchedulePresetValue(grant: RsuGrant | OptionGrant): VestingSchedulePresetId {
  const presetId = grant.vestingSchedule?.presetId
  if (presetId && VESTING_SCHEDULE_OPTIONS.some((option) => option.value === presetId)) {
    return presetId as VestingSchedulePresetId
  }

  const matchingPreset = Object.entries(VESTING_SCHEDULE_PRESETS).find(([, preset]) => (
    preset.vestingSchedule?.type === 'linear'
    && grant.cliffMonths === preset.cliffMonths
    && grant.vestingYears === preset.vestingYears
    && (grant.vestingFrequency ?? 'monthly') === preset.vestingFrequency
  ))

  return (matchingPreset?.[0] as VestingSchedulePresetId | undefined) ?? 'custom'
}

function vestingScheduleLabel(grant: RsuGrant | OptionGrant): string {
  const presetValue = vestingSchedulePresetValue(grant)

  if (presetValue !== 'custom') {
    return VESTING_SCHEDULE_PRESETS[presetValue].label
  }

  return `${grant.vestingYears}yr ${frequencyLabel(grant.vestingFrequency).toLowerCase()} · ${grant.cliffMonths}mo cliff`
}

function vestingStartSuffix(grant: RsuGrant | OptionGrant): string {
  if (!grant.vestingStartDate || grant.vestingStartDate === grant.grantDate) {
    return ''
  }

  return ` · vests from ${grant.vestingStartDate}`
}

function vestingSchedulePatchForPreset(presetId: VestingSchedulePresetId): Partial<VestingSchedulePatch> {
  if (presetId === 'custom') {
    return { vestingSchedule: null }
  }

  const preset = VESTING_SCHEDULE_PRESETS[presetId]

  return {
    cliffMonths: preset.cliffMonths,
    vestingYears: preset.vestingYears,
    vestingFrequency: preset.vestingFrequency,
    vestingSchedule: preset.vestingSchedule,
  }
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
    id: 'model-assumptions',
    label: 'Model assumptions',
    shortLabel: 'Assumptions',
    description: 'Shared tax and private-market assumptions.',
    icon: LineChart,
    presentation: 'column',
    component: notRenderedViaMillerShell,
    meta: { description: 'Shared tax and private-market assumptions.', icon: LineChart },
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

function nextScenarioId(existing: { id: string }[]): string {
  const used = new Set(existing.map((scenario) => scenario.id))
  let ordinal = existing.length + 1
  let id = `scenario-${ordinal}`
  while (used.has(id)) {
    ordinal += 1
    id = `scenario-${ordinal}`
  }
  return id
}

function buildDefaultValuationStage(year: number): ValuationScenarioStage {
  return {
    id: `stage-${year}`,
    year,
    stage: 'Stage',
    preferredPostMoneyValuation: 100000000,
    capitalDilutionPct: 0,
    employeePoolDilutionPct: 0,
    commonFmv: 0,
    commonFmvDiscountPct: 0,
    liquidityEvent: false,
  }
}

function buildDefaultValuationScenario(existing: ValuationScenario[], startYear: number): ValuationScenario {
  const id = nextScenarioId(existing)

  return {
    id,
    label: `Scenario ${existing.length + 1}`,
    outcome: 'medium',
    stages: [buildDefaultValuationStage(startYear)],
  }
}

function stageAssumptionKey(stage: ValuationScenarioStage): keyof ModelAssumptions['commonFmvPctOfPreferred'] {
  if (stage.liquidityEvent) {
    return 'liquidityEvent'
  }

  const tokens = (stage.stage ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  if (tokens.includes('ipo') || tokens.includes('exit') || tokens.includes('liquidity')) {
    return 'liquidityEvent'
  }
  if (tokens.includes('bridge') || (tokens.includes('no') && tokens.includes('raise'))) {
    return 'bridge'
  }
  if (tokens.includes('e') || tokens.includes('stagee')) {
    return 'stageE'
  }
  if (tokens.includes('d') || tokens.includes('staged')) {
    return 'stageD'
  }
  if (tokens.includes('c') || tokens.includes('stagec')) {
    return 'stageC'
  }
  if (tokens.includes('b') || tokens.includes('stageb')) {
    return 'stageB'
  }

  return 'stageA'
}

function commonFmvBenchmark(inputs: CareerCompInputs, job: JobSpec, stage: ValuationScenarioStage): string | null {
  if (job.company.fullyDilutedShares <= 0 || stage.preferredPostMoneyValuation <= 0) {
    return null
  }

  const key = stageAssumptionKey(stage)
  const pct = inputs.modelAssumptions.commonFmvPctOfPreferred[key] ?? DEFAULT_MODEL_ASSUMPTIONS.commonFmvPctOfPreferred[key]
  const preferredPerShare = currency(stage.preferredPostMoneyValuation).divide(job.company.fullyDilutedShares)
  const benchmark = preferredPerShare.multiply(pct / 100).value

  return `${currency(benchmark, { precision: 2 }).format()} @ ${pct}%`
}

function keyedValuationStages(scenario: ValuationScenario): { key: string; stage: ValuationScenarioStage }[] {
  const seen = new Map<string, number>()

  return scenario.stages.map((stage) => {
    const baseKey = `${scenario.id}-${stage.id ?? `${stage.year}-${stage.stage ?? 'stage'}`}`
    const duplicateCount = seen.get(baseKey) ?? 0
    seen.set(baseKey, duplicateCount + 1)

    return {
      key: duplicateCount === 0 ? baseKey : `${baseKey}-${duplicateCount + 1}`,
      stage,
    }
  })
}

function NumberField({ label, value, suffix, min, max, compact = false, onChange }: NumberFieldProps): ReactElement {
  const inputId = useId()

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(parseNumber(event.target.value))
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>): void {
    event.target.select()
  }

  if (compact) {
    return (
      <InputGroup className="h-9">
        <InputGroupInput aria-label={label} type="number" min={min} max={max} value={value} onChange={handleChange} onFocus={handleFocus} />
        {suffix ? <InputGroupAddon><InputGroupText>{suffix}</InputGroupText></InputGroupAddon> : null}
      </InputGroup>
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <InputGroup>
        <InputGroupInput id={inputId} type="number" min={min} max={max} value={value} onChange={handleChange} onFocus={handleFocus} />
        {suffix ? <InputGroupAddon><InputGroupText>{suffix}</InputGroupText></InputGroupAddon> : null}
      </InputGroup>
    </div>
  )
}

function MoneyField({ label, value, compact = false, onChange }: MoneyFieldProps): ReactElement {
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

  if (compact) {
    return (
      <InputGroup className="h-9">
        <InputGroupAddon><InputGroupText>$</InputGroupText></InputGroupAddon>
        <InputGroupInput aria-label={label} inputMode="decimal" value={draft ?? String(value)} onBlur={handleBlur} onChange={handleChange} onFocus={handleFocus} />
      </InputGroup>
    )
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

function SelectField<T extends string>({ label, value, options, compact = false, onChange }: {
  label: string
  value: T
  options: SelectOption<T>[]
  compact?: boolean
  onChange: (value: T) => void
}): ReactElement {
  const labelId = useId()
  const triggerId = useId()
  const selected = options.find((option) => option.value === value)

  if (compact) {
    return (
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger aria-label={label} className="h-9">{selected?.label ?? value}</SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

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

function GrantTypeCheckbox({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }): ReactElement {
  return (
    <label htmlFor={id} className="flex items-center gap-2 rounded-md border p-3 text-sm font-medium">
      <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      <span>{label}</span>
    </label>
  )
}

function rsuGrantSummary(grant: RsuGrant): string {
  return `${grant.kind === 'refresher' ? 'Refresher' : 'New hire'} · ${formatShares(grant.shareCount ?? 0)} sh · ${vestingScheduleLabel(grant)}${vestingStartSuffix(grant)}`
}

function optionGrantSummary(grant: OptionGrant): string {
  return `${grant.type.toUpperCase()} · ${formatShares(grant.shareCount)} sh @ $${grant.strike} · ${vestingScheduleLabel(grant)}${vestingStartSuffix(grant)}`
}

/** Compact, clickable list row for a grant. Editing happens in a dedicated Miller column. */
function GrantRow({ title, summary, selected, onEdit, onDuplicate, onRemove }: {
  title: string
  summary: string
  selected: boolean
  onEdit: () => void
  onDuplicate: () => void
  onRemove: () => void
}): ReactElement {
  return (
    <div
      className={selected
        ? 'flex items-center justify-between gap-2 rounded-md border border-primary/60 bg-primary/10 p-3 ring-1 ring-primary/30'
        : 'flex items-center justify-between gap-2 rounded-md border p-3'}
    >
      <button type="button" aria-current={selected ? 'true' : undefined} onClick={onEdit} className="min-w-0 flex-1 text-left focus-visible:outline-none">
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
    ? { ...base, id: nextGrantId(job.rsuGrants, job.id, 'rsu'), kind: 'refresher', cliffMonths: previous.cliffMonths, vestingYears: previous.vestingYears, vestingFrequency: previous.vestingFrequency, vestingSchedule: previous.vestingSchedule, grantPrice: previous.grantPrice }
    : base
}

function buildNewOptionGrant(job: JobSpec): OptionGrant {
  const previous = job.optionGrants[job.optionGrants.length - 1]
  const base = buildDefaultOptionGrant(job.id, job.optionGrants.length + 1)
  return previous
    ? { ...base, id: nextGrantId(job.optionGrants, job.id, 'opt'), kind: 'refresher', type: previous.type, strike: previous.strike, cliffMonths: previous.cliffMonths, vestingYears: previous.vestingYears, vestingFrequency: previous.vestingFrequency, vestingSchedule: previous.vestingSchedule, earlyExercise83b: previous.earlyExercise83b }
    : base
}

function RsuGrantsList({ job, onChange, onOpenGrantEditor, activeGrant }: { job: JobSpec; onChange: (job: JobSpec) => void; onOpenGrantEditor: OpenGrantEditor; activeGrant?: ActiveGrantSelection | null | undefined }): ReactElement {
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

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return
    }

    if (job.rsuGrants.length === 0) {
      return
    }

    event.preventDefault()
    const currentIndex = activeGrant?.jobId === job.id && activeGrant.grantType === 'rsu' && activeGrant.grantId
      ? job.rsuGrants.findIndex((grant) => grant.id === activeGrant.grantId)
      : -1
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = currentIndex === -1
      ? (direction === 1 ? 0 : job.rsuGrants.length - 1)
      : (currentIndex + direction + job.rsuGrants.length) % job.rsuGrants.length
    const nextGrant = job.rsuGrants[nextIndex]
    if (nextGrant) {
      onOpenGrantEditor(job.id, 'rsu', nextGrant.id)
    }
  }

  return (
    <div className="space-y-3" tabIndex={0} onKeyDown={handleKeyDown} aria-label="RSU grants section">
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
            selected={activeGrant?.jobId === job.id && activeGrant.grantType === 'rsu' && activeGrant.grantId === grant.id}
            onEdit={() => onOpenGrantEditor(job.id, 'rsu', grant.id)}
            onDuplicate={() => duplicateGrant(index)}
            onRemove={() => setGrants(job.rsuGrants.filter((entry) => entry.id !== grant.id))}
          />
        ))
      )}
    </div>
  )
}

function OptionGrantsList({ job, onChange, onOpenGrantEditor, activeGrant }: { job: JobSpec; onChange: (job: JobSpec) => void; onOpenGrantEditor: OpenGrantEditor; activeGrant?: ActiveGrantSelection | null | undefined }): ReactElement {
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

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return
    }

    if (job.optionGrants.length === 0) {
      return
    }

    event.preventDefault()
    const currentIndex = activeGrant?.jobId === job.id && activeGrant.grantType === 'opt' && activeGrant.grantId
      ? job.optionGrants.findIndex((grant) => grant.id === activeGrant.grantId)
      : -1
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = currentIndex === -1
      ? (direction === 1 ? 0 : job.optionGrants.length - 1)
      : (currentIndex + direction + job.optionGrants.length) % job.optionGrants.length
    const nextGrant = job.optionGrants[nextIndex]
    if (nextGrant) {
      onOpenGrantEditor(job.id, 'opt', nextGrant.id)
    }
  }

  return (
    <div className="space-y-3" tabIndex={0} onKeyDown={handleKeyDown} aria-label="Option grants section">
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
            selected={activeGrant?.jobId === job.id && activeGrant.grantType === 'opt' && activeGrant.grantId === grant.id}
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

function ModelAssumptionsEditor({ inputs, onChange }: { inputs: CareerCompInputs; onChange: (inputs: CareerCompInputs) => void }): ReactElement {
  const assumptions = inputs.modelAssumptions
  const commonFmvPctOfPreferred = assumptions.commonFmvPctOfPreferred

  function updateAssumptions(patch: Partial<ModelAssumptions>): void {
    onChange({
      ...inputs,
      modelAssumptions: {
        ...assumptions,
        ...patch,
        commonFmvPctOfPreferred: {
          ...assumptions.commonFmvPctOfPreferred,
          ...(patch.commonFmvPctOfPreferred ?? {}),
        },
        tax: {
          ...assumptions.tax,
          ...(patch.tax ?? {}),
        },
      },
    })
  }

  function updateCommonFmvPct(key: keyof ModelAssumptions['commonFmvPctOfPreferred'], value: number): void {
    updateAssumptions({
      commonFmvPctOfPreferred: {
        ...commonFmvPctOfPreferred,
        [key]: value,
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model assumptions</CardTitle>
        <CardDescription>Shared tax and private-market assumptions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Tax</Label>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Filing status" value={assumptions.tax.filingStatus} options={FILING_STATUS_OPTIONS} onChange={(filingStatus) => updateAssumptions({ tax: { filingStatus } })} />
          </div>
        </div>

        <div className="space-y-3 border-t pt-4">
          <Label className="text-sm font-semibold">Common FMV as % of preferred</Label>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Stage A" value={commonFmvPctOfPreferred.stageA} suffix="%" min={0} max={100} onChange={(value) => updateCommonFmvPct('stageA', value)} />
            <NumberField label="Stage B" value={commonFmvPctOfPreferred.stageB} suffix="%" min={0} max={100} onChange={(value) => updateCommonFmvPct('stageB', value)} />
            <NumberField label="Stage C" value={commonFmvPctOfPreferred.stageC} suffix="%" min={0} max={100} onChange={(value) => updateCommonFmvPct('stageC', value)} />
            <NumberField label="Bridge / no raise" value={commonFmvPctOfPreferred.bridge} suffix="%" min={0} max={100} onChange={(value) => updateCommonFmvPct('bridge', value)} />
            <NumberField label="Stage D" value={commonFmvPctOfPreferred.stageD} suffix="%" min={0} max={100} onChange={(value) => updateCommonFmvPct('stageD', value)} />
            <NumberField label="Stage E" value={commonFmvPctOfPreferred.stageE} suffix="%" min={0} max={100} onChange={(value) => updateCommonFmvPct('stageE', value)} />
            <NumberField label="IPO / exit" value={commonFmvPctOfPreferred.liquidityEvent} suffix="%" min={0} max={100} onChange={(value) => updateCommonFmvPct('liquidityEvent', value)} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function RsuGrantFields({ grant, onChange }: { grant: RsuGrant; onChange: (patch: Partial<RsuGrant>) => void }): ReactElement {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField label="Grant kind" value={grant.kind} options={GRANT_KIND_OPTIONS} onChange={(kind) => onChange({ kind })} />
      <DateField label="Grant date" value={grant.grantDate} onChange={(value) => onChange({ grantDate: value })} />
      <DateField label="Vesting start" value={grant.vestingStartDate ?? ''} onChange={(value) => onChange({ vestingStartDate: value || null })} />
      <NumberField label="Share count" value={grant.shareCount ?? 0} min={0} onChange={(value) => onChange({ shareCount: value })} />
      <MoneyField label="Grant value (optional)" value={grant.grantValue ?? 0} onChange={(value) => onChange({ grantValue: value > 0 ? value : undefined })} />
      <MoneyField label="Grant price (optional)" value={grant.grantPrice ?? 0} onChange={(value) => onChange({ grantPrice: value > 0 ? value : undefined })} />
      <SelectField label="Vesting schedule" value={vestingSchedulePresetValue(grant)} options={VESTING_SCHEDULE_OPTIONS} onChange={(presetId) => onChange(vestingSchedulePatchForPreset(presetId))} />
      <NumberField label="Cliff months" value={grant.cliffMonths} min={0} onChange={(value) => onChange({ cliffMonths: value, vestingSchedule: null })} />
      <NumberField label="Vesting years" value={grant.vestingYears} min={0} onChange={(value) => onChange({ vestingYears: value, vestingSchedule: null })} />
      <SelectField label="Vesting frequency" value={grant.vestingFrequency ?? 'monthly'} options={VESTING_FREQUENCY_OPTIONS} onChange={(vestingFrequency) => onChange({ vestingFrequency, vestingSchedule: null })} />
    </div>
  )
}

function OptionGrantFields({ grant, onChange }: { grant: OptionGrant; onChange: (patch: Partial<OptionGrant>) => void }): ReactElement {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField label="Grant kind" value={grant.kind} options={GRANT_KIND_OPTIONS} onChange={(kind) => onChange({ kind })} />
      <SelectField label="Option type" value={grant.type} options={OPTION_TYPE_OPTIONS} onChange={(type) => onChange({ type })} />
      <DateField label="Grant date" value={grant.grantDate} onChange={(value) => onChange({ grantDate: value })} />
      <DateField label="Vesting start" value={grant.vestingStartDate ?? ''} onChange={(value) => onChange({ vestingStartDate: value || null })} />
      <NumberField label="Share count" value={grant.shareCount} min={0} onChange={(value) => onChange({ shareCount: value })} />
      <MoneyField label="Strike price" value={grant.strike} onChange={(value) => onChange({ strike: value })} />
      <SelectField label="Vesting schedule" value={vestingSchedulePresetValue(grant)} options={VESTING_SCHEDULE_OPTIONS} onChange={(presetId) => onChange(vestingSchedulePatchForPreset(presetId))} />
      <NumberField label="Cliff months" value={grant.cliffMonths} min={0} onChange={(value) => onChange({ cliffMonths: value, vestingSchedule: null })} />
      <NumberField label="Vesting years" value={grant.vestingYears} min={0} onChange={(value) => onChange({ vestingYears: value, vestingSchedule: null })} />
      <SelectField label="Vesting frequency" value={grant.vestingFrequency ?? 'monthly'} options={VESTING_FREQUENCY_OPTIONS} onChange={(vestingFrequency) => onChange({ vestingFrequency, vestingSchedule: null })} />
      <SelectField label="83(b) early exercise" value={grant.earlyExercise83b ? 'yes' : 'no'} options={YES_NO_OPTIONS} onChange={(value) => onChange({ earlyExercise83b: value === 'yes' })} />
    </div>
  )
}

/** Adds (no `grantId`) or edits one grant in its own Miller column. Edits are written as fields change. */
export function GrantEditorColumn({ inputs, jobId, grantType, grantId, onChange, onGrantCreated }: {
  inputs: CareerCompInputs
  jobId: string
  grantType: GrantType
  grantId?: string | undefined
  onChange: (inputs: CareerCompInputs) => void
  onGrantCreated?: ((grantId: string) => void) | undefined
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

  function updateGrant(patch: Partial<RsuGrant> | Partial<OptionGrant>): void {
    if (!draft) {
      return
    }

    const nextDraft = { ...draft, ...patch } as RsuGrant | OptionGrant
    setDraft(nextDraft)
    onChange(updateJob(inputs, jobId, (current) => {
      if (grantType === 'rsu') {
        const grant = nextDraft as RsuGrant
        const exists = current.rsuGrants.some((entry) => entry.id === grant.id)
        return { ...current, rsuGrants: exists ? current.rsuGrants.map((entry) => (entry.id === grant.id ? grant : entry)) : [...current.rsuGrants, grant] }
      }

      const grant = nextDraft as OptionGrant
      const exists = current.optionGrants.some((entry) => entry.id === grant.id)
      return { ...current, optionGrants: exists ? current.optionGrants.map((entry) => (entry.id === grant.id ? grant : entry)) : [...current.optionGrants, grant] }
    }))

    if (!grantId) {
      onGrantCreated?.(nextDraft.id)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">{heading}</p>
        <p className="text-xs text-muted-foreground">{job.name}</p>
      </div>
      {grantType === 'rsu' ? (
        <RsuGrantFields grant={draft as RsuGrant} onChange={updateGrant} />
      ) : (
        <OptionGrantFields grant={draft as OptionGrant} onChange={updateGrant} />
      )}
    </div>
  )
}

export function ValuationTimelineColumn({ inputs, jobId, onChange }: {
  inputs: CareerCompInputs
  jobId: string
  onChange: (inputs: CareerCompInputs) => void
}): ReactElement {
  const job = findJob(inputs, jobId)

  if (!job) {
    return <p className="text-sm text-muted-foreground">This job is no longer available.</p>
  }

  const scenarios = job.company.valuationScenarios

  function setScenarios(valuationScenarios: ValuationScenario[]): void {
    onChange(updateJob(inputs, jobId, (current) => ({
      ...current,
      company: { ...current.company, valuationScenarios },
    })))
  }

  function updateScenario(scenarioId: string, patch: Partial<ValuationScenario>): void {
    setScenarios(scenarios.map((scenario) => (scenario.id === scenarioId ? { ...scenario, ...patch } : scenario)))
  }

  function updateStage(scenarioId: string, index: number, patch: Partial<ValuationScenarioStage>): void {
    setScenarios(scenarios.map((scenario) => {
      if (scenario.id !== scenarioId) {
        return scenario
      }

      return {
        ...scenario,
        stages: scenario.stages.map((stage, stageIndex) => (stageIndex === index ? { ...stage, ...patch } : stage)),
      }
    }))
  }

  function addStage(scenario: ValuationScenario): void {
    const lastYear = Math.max(inputs.startYear, ...scenario.stages.map((stage) => stage.year))
    updateScenario(scenario.id, { stages: [...scenario.stages, buildDefaultValuationStage(lastYear + 1)] })
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">Company valuation timeline</p>
        <p className="text-xs text-muted-foreground">{job.name}</p>
      </div>

      {scenarios.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No valuation scenarios for this private company.</p>
      ) : null}

      <div className="space-y-4">
        {scenarios.map((scenario, scenarioIndex) => (
          <div key={scenario.id} className="space-y-3 rounded-md border p-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
              <div className="space-y-2">
                <Label htmlFor={`${scenario.id}-label`}>Scenario</Label>
                <Input id={`${scenario.id}-label`} value={scenario.label} onChange={(event) => updateScenario(scenario.id, { label: event.target.value })} />
              </div>
              <SelectField label="Outcome" value={scenario.outcome} options={VALUATION_OUTCOME_OPTIONS} onChange={(outcome) => updateScenario(scenario.id, { outcome })} />
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${scenario.label}`}
                  disabled={scenarios.length === 1}
                  onClick={() => setScenarios(scenarios.filter((entry) => entry.id !== scenario.id))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="hidden grid-cols-[5rem_minmax(8rem,1.1fr)_minmax(9rem,1fr)_minmax(8rem,1fr)_7rem_7rem_7rem_8rem_2.5rem] gap-2 border-b px-1 pb-2 text-[11px] font-medium text-muted-foreground md:grid">
                <span>Year</span>
                <span>Stage</span>
                <span>Headline valuation</span>
                <span>Common FMV / 409A</span>
                <span>Capital dilution</span>
                <span>Pool dilution</span>
                <span>FMV discount</span>
                <span>Liquidity event</span>
                <span />
              </div>
              {keyedValuationStages(scenario).map(({ key, stage }, stageIndex) => {
                const benchmark = commonFmvBenchmark(inputs, job, stage)

                return (
                  <div key={key} className="grid gap-2 rounded-md border border-dashed p-3 md:grid-cols-[5rem_minmax(8rem,1.1fr)_minmax(9rem,1fr)_minmax(8rem,1fr)_7rem_7rem_7rem_8rem_2.5rem] md:items-start md:border-0 md:p-0">
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground md:hidden">Year</span>
                    <NumberField compact label="Year" value={stage.year} min={2000} onChange={(year) => updateStage(scenario.id, stageIndex, { year })} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground md:hidden">Stage</span>
                    <Input
                      aria-label="Stage"
                      className="h-9"
                      value={stage.stage ?? ''}
                      onChange={(event) => updateStage(scenario.id, stageIndex, { stage: event.target.value || null })}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground md:hidden">Headline valuation</span>
                    <MoneyField compact label="Headline valuation" value={stage.preferredPostMoneyValuation} onChange={(preferredPostMoneyValuation) => updateStage(scenario.id, stageIndex, { preferredPostMoneyValuation })} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground md:hidden">Common FMV / 409A</span>
                    <MoneyField compact label="Common FMV / 409A" value={stage.commonFmv} onChange={(commonFmv) => updateStage(scenario.id, stageIndex, { commonFmv })} />
                    {benchmark ? <p className="text-[11px] leading-tight text-muted-foreground">Benchmark {benchmark}</p> : null}
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground md:hidden">Capital dilution</span>
                    <NumberField compact label="Capital dilution" value={stage.capitalDilutionPct} suffix="%" min={0} max={100} onChange={(capitalDilutionPct) => updateStage(scenario.id, stageIndex, { capitalDilutionPct })} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground md:hidden">Pool dilution</span>
                    <NumberField compact label="Pool dilution" value={stage.employeePoolDilutionPct} suffix="%" min={0} max={100} onChange={(employeePoolDilutionPct) => updateStage(scenario.id, stageIndex, { employeePoolDilutionPct })} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground md:hidden">FMV discount</span>
                    <NumberField compact label="FMV discount" value={stage.commonFmvDiscountPct} suffix="%" min={0} max={100} onChange={(commonFmvDiscountPct) => updateStage(scenario.id, stageIndex, { commonFmvDiscountPct })} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground md:hidden">Liquidity event</span>
                    <SelectField compact label="Liquidity event" value={stage.liquidityEvent ? 'yes' : 'no'} options={YES_NO_OPTIONS} onChange={(value) => updateStage(scenario.id, stageIndex, { liquidityEvent: value === 'yes' })} />
                  </div>
                  <div className="flex justify-end md:justify-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${stage.stage ?? `stage ${stageIndex + 1}`}`}
                      title="Remove stage"
                      disabled={scenario.stages.length === 1}
                      onClick={() => updateScenario(scenario.id, { stages: scenario.stages.filter((_stage, index) => index !== stageIndex) })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                )
              })}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={() => addStage(scenario)}>
              <Plus className="size-4" /> Add stage
            </Button>
            {scenarioIndex < scenarios.length - 1 ? <div className="border-b" /> : null}
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" className="w-full" onClick={() => setScenarios([...scenarios, buildDefaultValuationScenario(scenarios, inputs.startYear)])}>
        <Plus className="size-4" /> Add scenario
      </Button>
    </div>
  )
}

function ValuationTimelineLauncher({ job, onOpenValuationTimeline }: { job: JobSpec; onOpenValuationTimeline: OpenValuationTimeline }): ReactElement {
  const scenarioCount = job.company.valuationScenarios.length
  const stageCount = job.company.valuationScenarios.reduce((total, scenario) => total + scenario.stages.length, 0)

  return (
    <button
      type="button"
      onClick={() => onOpenValuationTimeline(job.id)}
      className="group flex min-h-16 w-full items-center gap-3 rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground">
        <LineChart className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Company valuation timeline</span>
        <span className="block text-xs text-muted-foreground">{scenarioCount} scenario{scenarioCount === 1 ? '' : 's'} · {stageCount} stage row{stageCount === 1 ? '' : 's'}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function ProjectedRefreshersPreview({ job, startYear, horizonYears }: { job: JobSpec; startYear: number; horizonYears: number }): ReactElement | null {
  const showRsu = job.grantTypes.rsu && job.refresher.pctOfBase > 0
  const showOptions = job.grantTypes.options && job.refresher.optionPctOfFullyDilutedShares > 0 && job.company.fullyDilutedShares > 0
  if (!showRsu && !showOptions) {
    return null
  }

  const cadence = Math.max(1, Math.round(job.refresher.cadenceYears))
  const firstOffset = Math.max(0, Math.round(job.refresher.firstYearOffset))
  const rows: { key: string; year: number; title: string; summary: string }[] = []

  for (let offset = firstOffset; offset < horizonYears && rows.length < 4; offset += cadence) {
    const year = startYear + offset
    if (showRsu) {
      const raiseFactor = (1 + (job.comp.annualRaisePct / 100)) ** offset
      const value = currency(job.comp.baseSalary).multiply(raiseFactor).multiply(job.refresher.pctOfBase / 100).value
      rows.push({
        key: `${job.id}-projected-rsu-refresher-${year}`,
        year,
        title: `Projected RSU refresher · ${year}`,
        summary: `${formatMoney(value)} target value · ${job.refresher.vestingYears}yr ${frequencyLabel(job.refresher.vestingFrequency).toLowerCase()}`,
      })
    }
    if (showOptions) {
      const shares = currency(job.company.fullyDilutedShares).multiply(job.refresher.optionPctOfFullyDilutedShares / 100).value
      rows.push({
        key: `${job.id}-projected-option-refresher-${year}`,
        year,
        title: `Projected ISO refresher · ${year}`,
        summary: `${formatShares(shares)} shares · ${job.refresher.vestingYears}yr ${frequencyLabel(job.refresher.vestingFrequency).toLowerCase()}`,
      })
    }
  }

  if (rows.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="rounded-md border border-dashed p-3 text-xs opacity-60">
          <p className="font-medium">{row.title}</p>
          <p className="text-muted-foreground">{row.summary}</p>
        </div>
      ))}
    </div>
  )
}

function JobEditor({ job, startYear, horizonYears, onChange, onRemove, removeLabel, onOpenGrantEditor, onOpenValuationTimeline, activeGrant }: { job: JobSpec; startYear: number; horizonYears: number; onChange: (job: JobSpec) => void; onRemove?: (() => void) | undefined; removeLabel?: string | undefined; onOpenGrantEditor: OpenGrantEditor; onOpenValuationTimeline: OpenValuationTimeline; activeGrant?: ActiveGrantSelection | null | undefined }): ReactElement {
  const nameId = useId()
  const rsuGrantTypeId = useId()
  const optionGrantTypeId = useId()
  const isPrivate = job.company.type === 'private'
  const removeText = removeLabel ?? `Remove ${job.name}`
  const hasProjectedRefreshers = job.grantTypes.rsu || job.grantTypes.options

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">{job.name}</CardTitle>
          <CardDescription>{isPrivate ? 'Private company inputs include 409A, dilution, and liquidity date.' : 'Public company inputs use current share price.'}</CardDescription>
        </div>
        {onRemove ? <Button type="button" variant="ghost" size="sm" aria-label={removeText} title={removeText} onClick={onRemove}><Trash2 className="size-4" /></Button> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={nameId}>Job name</Label>
            <Input id={nameId} value={job.name} onChange={(event) => onChange({ ...job, name: event.target.value })} />
          </div>
          <DateField label="Start date" value={job.startDate ?? ''} onChange={(value) => onChange({ ...job, startDate: value || null })} />
          <SelectField label="Company type" value={job.company.type} options={COMPANY_TYPE_OPTIONS} onChange={(type) => onChange({ ...job, company: { ...job.company, type } })} />
          <MoneyField label="Base salary" value={job.comp.baseSalary} onChange={(value) => onChange({ ...job, comp: { ...job.comp, baseSalary: value } })} />
          <MoneyField label="Cash bonus" value={job.comp.cashBonus} onChange={(value) => onChange({ ...job, comp: { ...job.comp, cashBonus: value } })} />
          {isPrivate ? (
            <>
              <MoneyField label="Estimated share price" value={job.company.currentSharePrice} onChange={(value) => onChange({ ...job, company: { ...job.company, currentSharePrice: value } })} />
              <MoneyField label="409A price" value={job.company.fourNineA} onChange={(value) => onChange({ ...job, company: { ...job.company, fourNineA: value } })} />
              <NumberField label="Fully diluted shares" value={job.company.fullyDilutedShares} min={0} onChange={(value) => onChange({ ...job, company: { ...job.company, fullyDilutedShares: value } })} />
              <NumberField label="Annual dilution" value={job.company.annualDilutionPct} suffix="%" min={0} onChange={(value) => onChange({ ...job, company: { ...job.company, annualDilutionPct: value } })} />
              <DateField label="Liquidity date" value={job.company.liquidityDate ?? ''} onChange={(value) => onChange({ ...job, company: { ...job.company, liquidityDate: value || null } })} />
              <div className="sm:col-span-2">
                <ValuationTimelineLauncher job={job} onOpenValuationTimeline={onOpenValuationTimeline} />
              </div>
            </>
          ) : (
            <>
              <MoneyField label="Current share price" value={job.company.currentSharePrice} onChange={(value) => onChange({ ...job, company: { ...job.company, currentSharePrice: value } })} />
              <NumberField label="Fully diluted shares" value={job.company.fullyDilutedShares} min={0} onChange={(value) => onChange({ ...job, company: { ...job.company, fullyDilutedShares: value } })} />
            </>
          )}
          <NumberField label="Low growth" value={job.growthBands.lowPct} suffix="%" onChange={(value) => onChange({ ...job, growthBands: { ...job.growthBands, lowPct: value } })} />
          <NumberField label="Medium growth" value={job.growthBands.mediumPct} suffix="%" onChange={(value) => onChange({ ...job, growthBands: { ...job.growthBands, mediumPct: value } })} />
          <NumberField label="High growth" value={job.growthBands.highPct} suffix="%" onChange={(value) => onChange({ ...job, growthBands: { ...job.growthBands, highPct: value } })} />
        </div>

        <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
          <GrantTypeCheckbox id={rsuGrantTypeId} label="Grants RSU" checked={job.grantTypes.rsu} onChange={(rsu) => onChange({ ...job, grantTypes: { ...job.grantTypes, rsu } })} />
          <GrantTypeCheckbox id={optionGrantTypeId} label="Grants options" checked={job.grantTypes.options} onChange={(options) => onChange({ ...job, grantTypes: { ...job.grantTypes, options } })} />
        </div>

        <div className="space-y-3 border-t pt-4">
          <div>
            <Label className="text-sm font-semibold">Raises &amp; refreshers</Label>
            <p className="text-xs text-muted-foreground">Annual raise compounds base + bonus.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="Annual raise" value={job.comp.annualRaisePct} suffix="%" min={0} onChange={(value) => onChange({ ...job, comp: { ...job.comp, annualRaisePct: value } })} />
            {job.grantTypes.rsu ? (
              <NumberField label="RSU refresher" value={job.refresher.pctOfBase} suffix="% of base" min={0} onChange={(value) => onChange({ ...job, refresher: { ...job.refresher, pctOfBase: value } })} />
            ) : null}
            {job.grantTypes.options ? (
              <NumberField label="Projected ISO refresher" value={job.refresher.optionPctOfFullyDilutedShares} suffix="% fully diluted" min={0} max={100} onChange={(value) => onChange({ ...job, refresher: { ...job.refresher, optionPctOfFullyDilutedShares: value, optionType: 'iso' } })} />
            ) : null}
            {hasProjectedRefreshers ? (
              <>
                <NumberField label="Refresher every" value={job.refresher.cadenceYears} suffix="years" min={1} onChange={(value) => onChange({ ...job, refresher: { ...job.refresher, cadenceYears: value } })} />
                <NumberField label="First refresher after" value={job.refresher.firstYearOffset} suffix="years" min={0} onChange={(value) => onChange({ ...job, refresher: { ...job.refresher, firstYearOffset: value } })} />
                <NumberField label="Refresher vesting" value={job.refresher.vestingYears} suffix="years" min={0.25} onChange={(value) => onChange({ ...job, refresher: { ...job.refresher, vestingYears: value } })} />
                <NumberField label="Refresher cliff" value={job.refresher.cliffMonths} suffix="months" min={0} max={job.refresher.vestingYears * 12} onChange={(value) => onChange({ ...job, refresher: { ...job.refresher, cliffMonths: value } })} />
                <SelectField label="Refresher frequency" value={job.refresher.vestingFrequency ?? 'monthly'} options={VESTING_FREQUENCY_OPTIONS} onChange={(vestingFrequency) => onChange({ ...job, refresher: { ...job.refresher, vestingFrequency } })} />
              </>
            ) : null}
          </div>
          <ProjectedRefreshersPreview job={job} startYear={startYear} horizonYears={horizonYears} />
        </div>

        <div className="space-y-4 border-t pt-4">
          {job.grantTypes.rsu ? <RsuGrantsList job={job} onChange={onChange} onOpenGrantEditor={onOpenGrantEditor} activeGrant={activeGrant} /> : null}
          {job.grantTypes.options ? <OptionGrantsList job={job} onChange={onChange} onOpenGrantEditor={onOpenGrantEditor} activeGrant={activeGrant} /> : null}
        </div>
      </CardContent>
    </Card>
  )
}

export function CareerCompFormSection({ inputs, section, onChange, onOpenGrantEditor, onOpenValuationTimeline, activeGrant }: CareerCompFormSectionProps): ReactElement {
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

  if (section === 'model-assumptions') {
    return <ModelAssumptionsEditor inputs={inputs} onChange={onChange} />
  }

  if (section === 'current-job') {
    return (
      <div className="space-y-4">
        {inputs.currentJob ? (
          <JobEditor
            activeGrant={activeGrant}
            job={inputs.currentJob}
            startYear={inputs.startYear}
            horizonYears={inputs.horizonYears}
            onChange={(job) => onChange(updateJob(inputs, inputs.currentJob?.id ?? 'current', () => job))}
            onRemove={() => onChange({ ...inputs, currentJob: null })}
            removeLabel="Remove current job — compare against no job"
            onOpenGrantEditor={onOpenGrantEditor}
            onOpenValuationTimeline={onOpenValuationTimeline}
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
          activeGrant={activeGrant}
          job={job}
          startYear={inputs.startYear}
          horizonYears={inputs.horizonYears}
          onChange={(nextJob) => onChange(updateJob(inputs, job.id, () => nextJob))}
          onRemove={inputs.hypotheticalJobs.length > 1 ? () => onChange({ ...inputs, hypotheticalJobs: inputs.hypotheticalJobs.filter((entry) => entry.id !== job.id) }) : undefined}
          onOpenGrantEditor={onOpenGrantEditor}
          onOpenValuationTimeline={onOpenValuationTimeline}
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
