import { AlertTriangle, BarChart3, Briefcase, ChevronRight, Copy, LineChart, type LucideIcon, Table2 } from 'lucide-react'
import { type ReactElement, useEffect, useMemo, useState } from 'react'

import Container from '@/components/container'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MillerColumnShell, type MillerColumnShellColumn, type MillerRegistryEntry } from '@/components/ui/miller'

import { DEFAULT_OPPORTUNITY_COST_INPUTS } from './defaults'
import { normalizeOpportunityCostInputs } from './inputUtils'
import { computeOpportunityCost } from './opportunityCostApi'
import {
  notRenderedViaMillerShell,
  OPPORTUNITY_COST_FORM_SECTIONS,
  OpportunityCostFormSection,
  type OpportunityCostFormSectionId,
} from './OpportunityCostForm'
import { ProjectionAnnualFreeCashFlow, ProjectionLifetimeValue, ProjectionLiquidity, ProjectionVestingBreakdown } from './OpportunityCostResultViews'
import { parseOpportunityCostUrlState, serializeOpportunityCostUrlState } from './opportunityCostUrlState'
import type { OpportunityCostInitialData, OpportunityCostInputs, OpportunityCostProjection } from './types'

interface OpportunityCostPageProps {
  initialData: OpportunityCostInitialData
}

type OpportunityCostResultViewId = 'liquidity-over-time' | 'annual-fcf' | 'ltv-table' | 'vesting-breakdown'
type OpportunityCostColumnId = OpportunityCostFormSectionId | OpportunityCostResultViewId

interface OpportunityCostColumnMeta {
  description: string
  icon: LucideIcon
}

type OpportunityCostColumnState =
  | { kind: 'form'; id: OpportunityCostFormSectionId }
  | { kind: 'result'; id: OpportunityCostResultViewId }

interface ResultViewRegistryEntry extends MillerRegistryEntry<unknown, OpportunityCostResultViewId, OpportunityCostColumnMeta> {
  render: (projection: OpportunityCostProjection) => ReactElement
}

export const RESULT_VIEWS: ResultViewRegistryEntry[] = [
  {
    id: 'liquidity-over-time',
    label: 'Expected Liquidity Value Over Time',
    shortLabel: 'Liquidity',
    presentation: 'column',
    component: notRenderedViaMillerShell,
    meta: { description: 'Cumulative realizable equity value by job and growth band.', icon: LineChart },
    size: 'wide',
    render: (projection) => <ProjectionLiquidity projection={projection} />,
  },
  {
    id: 'annual-fcf',
    label: 'Annual Free Cash Flow',
    shortLabel: 'Annual FCF',
    presentation: 'column',
    component: notRenderedViaMillerShell,
    meta: { description: 'Pre-tax annual cash flow breakdown per job.', icon: BarChart3 },
    size: 'wide',
    render: (projection) => <ProjectionAnnualFreeCashFlow projection={projection} />,
  },
  {
    id: 'ltv-table',
    label: 'Lifetime Value Comparison',
    shortLabel: 'LTV Table',
    presentation: 'column',
    component: notRenderedViaMillerShell,
    meta: { description: 'Lifetime totals and server-computed deltas vs. current job.', icon: Table2 },
    size: 'wide',
    render: (projection) => <ProjectionLifetimeValue projection={projection} />,
  },
  {
    id: 'vesting-breakdown',
    label: 'Equity Vesting Breakdown',
    shortLabel: 'Vesting',
    presentation: 'column',
    component: notRenderedViaMillerShell,
    meta: { description: 'RSU, ISO, and NSO vesting rows by grant.', icon: Briefcase },
    size: 'wide',
    render: (projection) => <ProjectionVestingBreakdown projection={projection} />,
  },
]

function findMeta<T extends { id: string }>(list: readonly T[], id: string): T {
  const found = list.find((entry) => entry.id === id)
  if (!found) {
    throw new Error(`Unknown Opportunity Cost metadata id: ${id}`)
  }
  return found
}

function initialInputs(initialData: OpportunityCostInitialData): OpportunityCostInputs {
  const base = initialData.inputs ?? DEFAULT_OPPORTUNITY_COST_INPUTS
  return window.location.search ? parseOpportunityCostUrlState(window.location.search, base) : normalizeOpportunityCostInputs(base)
}

function replaceUrlWithInputs(inputs: OpportunityCostInputs): string {
  const queryString = serializeOpportunityCostUrlState(inputs)
  const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}`

  if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
    window.history.replaceState(null, '', nextUrl)
  }

  return window.location.href
}

function ProjectionEmptyState({ loading }: { loading: boolean }): ReactElement {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
      {loading ? 'Calculating projection...' : 'Projection will appear after the backend compute endpoint returns successfully.'}
    </div>
  )
}

function ColumnOpenButton({ label, description, icon: Icon, onClick }: { label: string; description: string; icon: LucideIcon; onClick: () => void }): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${label}`}
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
  entry: Pick<MillerRegistryEntry<unknown, OpportunityCostColumnId, OpportunityCostColumnMeta>, 'id' | 'shortLabel' | 'meta'>,
  onOpen: () => void,
): ReactElement {
  const details = entry.meta!
  return <ColumnOpenButton key={entry.id} label={entry.shortLabel} description={details.description} icon={details.icon} onClick={onOpen} />
}

export function OpportunityCostPage({ initialData }: OpportunityCostPageProps): ReactElement {
  const [inputs, setInputs] = useState<OpportunityCostInputs>(() => initialInputs(initialData))
  const normalizedInputs = useMemo(() => normalizeOpportunityCostInputs(inputs), [inputs])
  const [projection, setProjection] = useState<OpportunityCostProjection | null>(initialData.projection)
  const [loading, setLoading] = useState(initialData.projection === null)
  const [status, setStatus] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState(window.location.href)
  const [activeColumn, setActiveColumn] = useState<OpportunityCostColumnState | null>(null)

  useEffect(() => {
    setShareUrl(replaceUrlWithInputs(normalizedInputs))
  }, [normalizedInputs])

  useEffect(() => {
    let active = true
    setLoading(true)
    const timeout = window.setTimeout(() => {
      computeOpportunityCost(normalizedInputs)
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

  async function copyShareUrl(): Promise<void> {
    await navigator.clipboard.writeText(shareUrl)
    setStatus('URL-state link copied.')
  }

  function openColumn(column: OpportunityCostColumnState): void {
    setActiveColumn(column)
  }

  function closeColumn(_depth: number): void {
    setActiveColumn(null)
  }

  function toMillerColumn(column: OpportunityCostColumnState): MillerColumnShellColumn {
    if (column.kind === 'form') {
      const section = findMeta(OPPORTUNITY_COST_FORM_SECTIONS, column.id)

      return {
        key: `form:${column.id}`,
        id: column.id,
        label: section.label,
        shortLabel: section.shortLabel,
        children: <OpportunityCostFormSection section={column.id} inputs={inputs} onChange={setInputs} />,
      }
    }

    const view = findMeta(RESULT_VIEWS, column.id)

    return {
      key: `result:${column.id}`,
      id: column.id,
      label: view.label,
      shortLabel: view.shortLabel,
      size: view.size,
      children: projection ? view.render(projection) : <ProjectionEmptyState loading={loading} />,
    }
  }

  const columns: MillerColumnShellColumn[] = activeColumn ? [toMillerColumn(activeColumn)] : []
  const warnings = projection?.warnings ?? []

  const homeView = (
    <div className="grid gap-6 p-4 md:p-6">
      <section className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Financial planning</Badge>
          <Badge variant="outline">Public calculator</Badge>
          {loading ? <Badge variant="outline">Calculating</Badge> : null}
        </div>
        <h1 className="text-2xl font-semibold text-foreground md:text-3xl">Opportunity Cost Planner</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Compare a current job (or no job) against hypothetical offers with cash compensation, equity liquidity, and vesting views.
        </p>
      </section>

      {warnings.length > 0 ? (
        <section className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="grid gap-1">
            {warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        </section>
      ) : null}

      {status ? (
        <section className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">{status}</section>
      ) : null}

      <section className="grid gap-3 rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Scenario actions</h2>
            <p className="text-sm text-muted-foreground">Reserved action slots for later Save/Fork, Copy-link, Export, and confidential share-mode work.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2" data-oc-action-bar>
            <span data-oc-action-slot="save-fork" />
            <Button type="button" variant="secondary" onClick={copyShareUrl} data-oc-action-slot="copy-link">
              <Copy className="size-4" /> Copy URL state
            </Button>
            <span data-oc-action-slot="export" />
            <span data-oc-action-slot="share-mode" />
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Inputs</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {OPPORTUNITY_COST_FORM_SECTIONS.map((section) => renderColumnLauncher(section, () => openColumn({ kind: 'form', id: section.id })))}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Results</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {RESULT_VIEWS.map((view) => renderColumnLauncher(view, () => openColumn({ kind: 'result', id: view.id })))}
        </div>
      </section>
    </div>
  )

  return (
    <Container fluid className="flex h-[calc(100vh-4rem)] min-h-[680px] flex-col bg-background">
      <div className="relative min-h-0 flex-1">
        <MillerColumnShell homeView={homeView} columns={columns} onTruncate={closeColumn} />
      </div>
    </Container>
  )
}

export default OpportunityCostPage
