import { AlertTriangle, BarChart3, ChevronRight, Copy, GitFork, LineChart, type LucideIcon, PiggyBank, Save, Table2, Users } from 'lucide-react'
import { type ReactElement, useCallback, useEffect, useId, useMemo, useState } from 'react'

import Container from '@/components/container'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MillerColumnShell, type MillerColumnShellColumn } from '@/components/ui/miller-column-shell'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

import { DEFAULT_ROTH_CONVERSION_INPUTS } from './defaults'
import { ageFromBirthYear, findMeta, normalizeRothConversionInputs } from './inputUtils'
import { computeRothConversion, saveRothConversionScenario, updateRothConversionScenario } from './rothConversionApi'
import {
  ROTH_CONVERSION_FORM_SECTIONS,
  RothConversionFormSection,
  type RothConversionFormSectionId,
} from './RothConversionForm'
import {
  formatProjectionMoney,
  getLifetimeTax,
  getPreferredScenario,
  ProjectionBalances,
  ProjectionCompare,
  ProjectionOverview,
  ProjectionSocialSecurity,
  ProjectionTaxDetail,
  ProjectionYears,
} from './RothConversionResultViews'
import { parseRothConversionUrlState, serializeRothConversionUrlState } from './rothConversionUrlState'
import type { RothConversionInitialData, RothConversionInputs, RothConversionProjection, RothConversionScenarioMeta, RothConversionScenarioProjection } from './types'

interface RothConversionPageProps {
  initialData: RothConversionInitialData
}

type RothConversionResultViewId = 'overview' | 'years' | 'balances' | 'social-security' | 'tax-detail' | 'compare'

interface RothConversionResultViewMeta {
  id: RothConversionResultViewId
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  wide?: boolean
  render: (context: RothConversionResultViewContext) => ReactElement
}

type RothConversionColumnState =
  | { kind: 'form'; id: RothConversionFormSectionId }
  | { kind: 'result'; id: RothConversionResultViewId }

interface RothConversionResultViewContext {
  projection: RothConversionProjection
  scenario: RothConversionScenarioProjection
}

const RESULT_VIEWS: RothConversionResultViewMeta[] = [
  {
    id: 'overview',
    label: 'Projection Overview',
    shortLabel: 'Overview',
    description: 'Summary cards, income stack, RMD rates, and conversion window.',
    icon: BarChart3,
    wide: true,
    render: ({ projection, scenario }) => <ProjectionOverview projection={projection} scenario={scenario} />,
  },
  {
    id: 'years',
    label: 'Year-by-Year Income',
    shortLabel: 'Years',
    description: 'Annual income stack used by the tax calculation.',
    icon: LineChart,
    wide: true,
    render: ({ scenario }) => <ProjectionYears scenario={scenario} />,
  },
  {
    id: 'balances',
    label: 'Balance Projection',
    shortLabel: 'Balances',
    description: 'Ending balances after conversions, taxes, and withdrawals.',
    icon: PiggyBank,
    wide: true,
    render: ({ scenario }) => <ProjectionBalances scenario={scenario} />,
  },
  {
    id: 'social-security',
    label: 'Social Security',
    shortLabel: 'Social Security',
    description: 'Claiming comparison for the selected scenario.',
    icon: Users,
    render: ({ scenario }) => <ProjectionSocialSecurity scenario={scenario} />,
  },
  {
    id: 'tax-detail',
    label: 'Tax Detail',
    shortLabel: 'Tax Detail',
    description: 'IRMAA tiers and annual tax table.',
    icon: Table2,
    wide: true,
    render: ({ projection, scenario }) => <ProjectionTaxDetail projection={projection} scenario={scenario} />,
  },
  {
    id: 'compare',
    label: 'Scenario Compare',
    shortLabel: 'Compare',
    description: 'Side-by-side lifetime tax and estate outcomes.',
    icon: Table2,
    wide: true,
    render: ({ projection }) => <ProjectionCompare projection={projection} />,
  },
]

function urlStatePathname(): string {
  return window.location.pathname.replace(/\/s\/[^/]+$/, '')
}

function replaceUrlWithInputs(inputs: RothConversionInputs, pathname = window.location.pathname): string {
  const queryString = serializeRothConversionUrlState(inputs)
  const nextUrl = `${pathname}${queryString ? `?${queryString}` : ''}`

  if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
    window.history.replaceState(null, '', nextUrl)
  }

  return window.location.href
}

function initialInputs(initialData: RothConversionInitialData): RothConversionInputs {
  const base = initialData.inputs ?? DEFAULT_ROTH_CONVERSION_INPUTS

  return window.location.search
    ? parseRothConversionUrlState(window.location.search, base)
    : base
}

function getSelectedScenario(
  projection: RothConversionProjection | null,
  selectedScenarioId: string | null,
): RothConversionScenarioProjection | null {
  if (!projection) {
    return null
  }

  return projection.scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? getPreferredScenario(projection)
}

function hasLegacyCurrentAgePair(inputs: RothConversionInputs): boolean {
  return (
    inputs.people.primaryCurrentAge !== ageFromBirthYear(inputs.currentYear, inputs.people.primaryBirthYear)
    || inputs.people.spouseCurrentAge !== ageFromBirthYear(inputs.currentYear, inputs.people.spouseBirthYear)
  )
}

function ProjectionEmptyState({ loading }: { loading: boolean }): ReactElement {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
      {loading ? 'Calculating projection...' : 'Projection will appear after the inputs are valid.'}
    </div>
  )
}

function ColumnOpenButton({
  label,
  description,
  icon: Icon,
  onClick,
}: {
  label: string
  description: string
  icon: LucideIcon
  onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-16 w-full items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function renderColumnLauncher(
  meta: { id: string; shortLabel: string; description: string; icon: LucideIcon },
  onOpen: () => void,
): ReactElement {
  return (
    <ColumnOpenButton
      key={meta.id}
      label={meta.shortLabel}
      description={meta.description}
      icon={meta.icon}
      onClick={onOpen}
    />
  )
}

export default function RothConversionPage({ initialData }: RothConversionPageProps): ReactElement {
  const scenarioSelectId = useId()
  const [inputs, setInputs] = useState<RothConversionInputs>(() => initialInputs(initialData))
  const [preserveLegacyCurrentAges, setPreserveLegacyCurrentAges] = useState(
    () => initialData.scenario !== null && !window.location.search && hasLegacyCurrentAgePair(initialData.inputs ?? DEFAULT_ROTH_CONVERSION_INPUTS),
  )
  const normalizedInputs = useMemo(
    () => normalizeRothConversionInputs(inputs, { preserveCurrentAges: preserveLegacyCurrentAges }),
    [inputs, preserveLegacyCurrentAges],
  )
  const [projection, setProjection] = useState<RothConversionProjection | null>(initialData.projection)
  const [savedScenario, setSavedScenario] = useState<RothConversionScenarioMeta | null>(initialData.scenario)
  const [title, setTitle] = useState(initialData.scenario?.title ?? 'Roth conversion plan')
  const [canEdit, setCanEdit] = useState(initialData.canEdit)
  const [loading, setLoading] = useState(initialData.projection === null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [urlOnlyShareUrl, setUrlOnlyShareUrl] = useState(window.location.href)
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)
  const [activeColumn, setActiveColumn] = useState<RothConversionColumnState | null>(null)
  const selectedScenario = useMemo(
    () => getSelectedScenario(projection, selectedScenarioId),
    [projection, selectedScenarioId],
  )
  const shareUrl = savedScenario?.shareUrl ?? urlOnlyShareUrl
  const isSharedView = savedScenario !== null
  const saveLabel = useMemo(() => {
    if (savedScenario && canEdit) {
      return 'Update'
    }

    if (savedScenario && !canEdit) {
      return 'Fork'
    }

    return 'Save'
  }, [canEdit, savedScenario])

  const handleInputsChange = useCallback((nextInputs: RothConversionInputs): void => {
    setPreserveLegacyCurrentAges(false)
    setInputs(nextInputs)
  }, [])

  useEffect(() => {
    if (!isSharedView || !canEdit) {
      setUrlOnlyShareUrl(replaceUrlWithInputs(normalizedInputs))
    }
  }, [canEdit, normalizedInputs, isSharedView])

  useEffect(() => {
    let active = true
    setLoading(true)
    const timeout = window.setTimeout(() => {
      computeRothConversion(normalizedInputs)
        .then((nextProjection) => {
          if (active) {
            setProjection(nextProjection)
            setStatus(null)
          }
        })
        .catch((error: unknown) => {
          if (active) {
            setStatus(error instanceof Error ? error.message : String(error))
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false)
          }
        })
    }, 350)

    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [normalizedInputs])

  async function handleSave(): Promise<void> {
    if (!initialData.authenticated) {
      if (savedScenario && !canEdit) {
        setSavedScenario(null)
        setCanEdit(false)
        setUrlOnlyShareUrl(replaceUrlWithInputs(normalizedInputs, urlStatePathname()))
        setStatus('Forked to URL state. Edits update this link.')
        return
      }

      setStatus('Log in to save a short-code link.')
      return
    }

    setSaving(true)
    setStatus(null)

    try {
      const response = savedScenario && canEdit
        ? await updateRothConversionScenario(savedScenario.shortCode, title, normalizedInputs)
        : await saveRothConversionScenario(title, normalizedInputs)
      const nextScenario: RothConversionScenarioMeta = {
        id: response.id,
        shortCode: response.shortCode,
        title,
        shareUrl: response.shareUrl,
        ownerUserId: null,
      }
      setSavedScenario(nextScenario)
      setCanEdit(true)
      setProjection(response.projection)
      window.history.replaceState(null, '', response.shareUrl)
      setStatus(savedScenario && canEdit ? 'Updated.' : 'Saved.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  async function copyShareUrl(): Promise<void> {
    await navigator.clipboard.writeText(shareUrl)
    setStatus('Share link copied.')
  }

  function openColumn(column: RothConversionColumnState): void {
    setActiveColumn(column)
  }

  function closeColumn(_depth: number): void {
    setActiveColumn(null)
  }

  function toMillerColumn(column: RothConversionColumnState): MillerColumnShellColumn {
    if (column.kind === 'form') {
      const section = findMeta(ROTH_CONVERSION_FORM_SECTIONS, column.id)

      return {
        key: `form:${column.id}`,
        id: column.id,
        label: section.label,
        shortLabel: section.shortLabel,
        children: <RothConversionFormSection section={column.id} inputs={inputs} onChange={handleInputsChange} />,
      }
    }

    const view = findMeta(RESULT_VIEWS, column.id)

    return {
      key: `result:${column.id}`,
      id: column.id,
      label: view.label,
      shortLabel: view.shortLabel,
      wide: view.wide,
      children: projection && selectedScenario
        ? view.render({ projection, scenario: selectedScenario })
        : <ProjectionEmptyState loading={loading} />,
    }
  }

  const columns: MillerColumnShellColumn[] = activeColumn ? [toMillerColumn(activeColumn)] : []

  const warnings = projection?.warnings ?? []

  const homeView = (
    <div className="grid gap-6 p-4 md:p-6">
      <section className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Financial planning</Badge>
          {loading ? <Badge variant="outline">Calculating</Badge> : null}
        </div>
        <h1 className="text-2xl font-semibold text-foreground md:text-3xl">Roth Conversion Planner</h1>
      </section>

      <section className="grid gap-3 rounded-md border border-border bg-card p-4">
        <div className="grid gap-2">
          <Label htmlFor={scenarioSelectId}>Scenario</Label>
          {projection && selectedScenario ? (
            <Select
              value={selectedScenario.id}
              onValueChange={setSelectedScenarioId}
            >
              <SelectTrigger id={scenarioSelectId} className="w-full">
                <span className="truncate">{selectedScenario.name}</span>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} sideOffset={4}>
                {projection.scenarios.map((scenario) => (
                  <SelectItem key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <ProjectionEmptyState loading={loading} />
          )}
        </div>
      </section>

      {selectedScenario ? (
        <section className="grid gap-3 rounded-md border border-border bg-card p-4">
          <div className="grid gap-1">
            <h2 className="text-base font-semibold text-foreground">{selectedScenario.name}</h2>
            <p className="text-sm text-muted-foreground">
              {formatProjectionMoney(getLifetimeTax(selectedScenario))} lifetime tax; {formatProjectionMoney(selectedScenario.summary.finalEstateValue)} final estate.
            </p>
          </div>
        </section>
      ) : null}

      {warnings.length > 0 ? (
        <section className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="grid gap-1">
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Inputs</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROTH_CONVERSION_FORM_SECTIONS.map((section) => (
            renderColumnLauncher(section, () => openColumn({ kind: 'form', id: section.id }))
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Projection</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {RESULT_VIEWS.map((view) => (
            renderColumnLauncher(view, () => openColumn({ kind: 'result', id: view.id }))
          ))}
        </div>
      </section>
    </div>
  )

  return (
    <Container fluid className="flex h-[calc(100vh-4rem)] min-h-[680px] flex-col bg-background">
      <header className="flex shrink-0 flex-col gap-3 border-b border-border bg-card px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-1">
          <Label htmlFor="scenario-title">Scenario title</Label>
          <Input
            id="scenario-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="h-9 w-full min-w-0 lg:w-[24rem]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {savedScenario && !canEdit ? <GitFork className="size-4" /> : <Save className="size-4" />}
            {saving ? 'Saving...' : saveLabel}
          </Button>
          <Button type="button" variant="secondary" onClick={copyShareUrl}>
            <Copy className="size-4" />
            Copy link
          </Button>
          {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <MillerColumnShell homeView={homeView} columns={columns} onTruncate={closeColumn} />
      </div>
    </Container>
  )
}
