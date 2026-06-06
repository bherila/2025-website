import { AlertTriangle, BarChart3, Briefcase, ChevronRight, Copy, Download, FolderOpen, GitFork, LineChart, type LucideIcon, ReceiptText, Save, Table2, Trash2, Upload } from 'lucide-react'
import { type ReactElement, useEffect, useMemo, useState } from 'react'

import Container from '@/components/container'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MillerColumnShell, type MillerColumnShellColumn, type MillerRegistryEntry } from '@/components/ui/miller'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { downloadFinanceExport } from '@/lib/finance/downloadFinanceExport'

import {
  activateCareerCompWorkflow,
  claimCareerComparison,
  computeCareerComp,
  deleteCareerCompWorkflow,
  getCareerCompWorkflow,
  importRsuIntoCurrentJob,
  listCareerCompWorkflows,
  saveCareerComparison,
  shareCareerComparison,
  updateCareerComparison,
} from './careerCompApi'
import {
  CAREER_COMP_FORM_SECTIONS,
  CareerCompFormSection,
  type CareerCompFormSectionId,
  notRenderedViaMillerShell,
} from './CareerCompForm'
import {
  ProjectionAfterTaxFreeCashFlow,
  ProjectionAfterTaxLiquidity,
  ProjectionAnnualFreeCashFlow,
  ProjectionLifetimeValue,
  ProjectionLiquidity,
  ProjectionVestingBreakdown,
} from './CareerCompResultViews'
import { parseCareerCompUrlState, serializeCareerCompUrlState } from './careerCompUrlState'
import { DEFAULT_CAREER_COMP_INPUTS } from './defaults'
import { normalizeCareerCompInputs } from './inputUtils'
import { SavedJobPicker } from './SavedJobPicker'
import type { CareerComparisonMeta, CareerCompInitialData, CareerCompInputs, CareerCompProjection, CareerCompWorkflowSummary } from './types'

interface CareerCompPageProps {
  initialData: CareerCompInitialData
}

type CareerCompResultViewId = 'liquidity-over-time' | 'annual-fcf' | 'ltv-table' | 'vesting-breakdown' | 'after-tax-liquidity' | 'after-tax-fcf'
type CareerCompColumnId = CareerCompFormSectionId | CareerCompResultViewId

interface CareerCompColumnMeta {
  description: string
  icon: LucideIcon
}

type CareerCompColumnState =
  | { kind: 'form'; id: CareerCompFormSectionId }
  | { kind: 'result'; id: CareerCompResultViewId }

interface ResultViewRegistryEntry extends MillerRegistryEntry<unknown, CareerCompResultViewId, CareerCompColumnMeta> {
  render: (projection: CareerCompProjection) => ReactElement
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
  {
    id: 'after-tax-liquidity',
    label: 'After-Tax Expected Liquidity Value Over Time',
    shortLabel: 'After-Tax Liquidity',
    presentation: 'column',
    component: notRenderedViaMillerShell,
    meta: { description: 'Liquidity bands net of federal regular tax and AMT from the tax-facts engine.', icon: LineChart },
    size: 'wide',
    render: (projection) => <ProjectionAfterTaxLiquidity projection={projection} />,
  },
  {
    id: 'after-tax-fcf',
    label: 'After-Tax FCF and Lifetime Value',
    shortLabel: 'After-Tax FCF',
    presentation: 'column',
    component: notRenderedViaMillerShell,
    meta: { description: 'After-tax annual FCF, LTV deltas, and ISO/NSO/83(b)/AMT breakdown.', icon: ReceiptText },
    size: 'wide',
    render: (projection) => <ProjectionAfterTaxFreeCashFlow projection={projection} />,
  },
]

function findMeta<T extends { id: string }>(list: readonly T[], id: string): T {
  const found = list.find((entry) => entry.id === id)
  if (!found) {
    throw new Error(`Unknown Career Comp metadata id: ${id}`)
  }
  return found
}

function initialInputs(initialData: CareerCompInitialData): CareerCompInputs {
  const base = initialData.inputs ?? DEFAULT_CAREER_COMP_INPUTS
  return window.location.search ? parseCareerCompUrlState(window.location.search, base) : normalizeCareerCompInputs(base)
}

function urlStatePathname(): string {
  return window.location.pathname.replace(/\/s\/[^/]+$/, '')
}

function replaceUrlWithInputs(inputs: CareerCompInputs, pathname = window.location.pathname): string {
  const queryString = serializeCareerCompUrlState(inputs)
  const nextUrl = `${pathname}${queryString ? `?${queryString}` : ''}`

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
  entry: Pick<MillerRegistryEntry<unknown, CareerCompColumnId, CareerCompColumnMeta>, 'id' | 'shortLabel' | 'meta'>,
  onOpen: () => void,
): ReactElement {
  const details = entry.meta!
  return <ColumnOpenButton key={entry.id} label={entry.shortLabel} description={details.description} icon={details.icon} onClick={onOpen} />
}

export function CareerCompPage({ initialData }: CareerCompPageProps): ReactElement {
  const [inputs, setInputs] = useState<CareerCompInputs>(() => initialInputs(initialData))
  const normalizedInputs = useMemo(() => normalizeCareerCompInputs(inputs), [inputs])
  const [projection, setProjection] = useState<CareerCompProjection | null>(initialData.projection)
  const [loading, setLoading] = useState(initialData.projection === null)
  const [status, setStatus] = useState<string | null>(null)
  const [savedComparison, setSavedComparison] = useState<CareerComparisonMeta | null>(initialData.comparison ?? null)
  const [canEdit, setCanEdit] = useState(initialData.canEdit ?? false)
  const [shareIncludesCurrent, setShareIncludesCurrent] = useState(initialData.comparison?.shareIncludesCurrent ?? true)
  const [saving, setSaving] = useState(false)
  const [workflowSummaries, setWorkflowSummaries] = useState<CareerCompWorkflowSummary[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('')
  const [savedInputsJson, setSavedInputsJson] = useState(() => (initialData.comparison && initialData.canEdit ? JSON.stringify(normalizeCareerCompInputs(initialData.inputs)) : null))
  const [workflowBusy, setWorkflowBusy] = useState(false)
  const [activeColumn, setActiveColumn] = useState<CareerCompColumnState | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const isSharedView = savedComparison !== null
  const hasUnsavedChanges = savedInputsJson === null || savedInputsJson !== JSON.stringify(normalizedInputs)
  const saveLabel = useMemo(() => {
    if (savedComparison && canEdit) {
      return 'Update'
    }
    if (savedComparison && !canEdit) {
      return 'Fork'
    }
    return 'Save'
  }, [canEdit, savedComparison])

  useEffect(() => {
    if (!isSharedView || !canEdit) {
      replaceUrlWithInputs(normalizedInputs)
    }
  }, [canEdit, isSharedView, normalizedInputs])

  useEffect(() => {
    if (!initialData.authenticated) {
      return
    }

    let active = true
    listCareerCompWorkflows()
      .then((response) => {
        if (active) {
          setWorkflowSummaries(response.workflows)
          setSelectedWorkflowId(savedComparison ? String(savedComparison.id) : '')
        }
      })
      .catch(() => {
        if (active) {
          setWorkflowSummaries([])
        }
      })

    return () => {
      active = false
    }
  }, [initialData.authenticated, savedComparison])

  useEffect(() => {
    if (!initialData.authenticated || !savedComparison || canEdit || savedComparison.ownerUserId !== null) {
      return
    }

    let active = true
    claimCareerComparison(savedComparison.shortCode)
      .then((response) => {
        if (active) {
          setCanEdit(true)
          setSavedComparison((current) => (current ? { ...current, shareUrl: response.shareUrl } : current))
          setStatus('Saved comparison is now linked to your account.')
        }
      })
      .catch(() => {
        // Leave the comparison as a read-only fork target if the claim is rejected.
      })

    return () => {
      active = false
    }
  }, [canEdit, initialData.authenticated, savedComparison])

  useEffect(() => {
    let active = true
    setLoading(true)
    const timeout = window.setTimeout(() => {
      computeCareerComp(normalizedInputs)
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
      if (savedComparison && !canEdit) {
        setSavedComparison(null)
        setCanEdit(false)
        replaceUrlWithInputs(normalizedInputs, urlStatePathname())
        setStatus('Forked to URL state. Edits update this link.')
        return
      }

      setStatus('Log in to save a share link.')
      return
    }

    setSaving(true)
    setStatus(null)

    try {
      const response = savedComparison && canEdit
        ? await updateCareerComparison(savedComparison.id, normalizedInputs, shareIncludesCurrent)
        : await saveCareerComparison(normalizedInputs, shareIncludesCurrent)
      const nextComparison: CareerComparisonMeta = {
        id: response.id,
        shortCode: response.shortCode,
        shareUrl: response.shareUrl,
        ownerUserId: response.ownerUserId,
        shareIncludesCurrent,
        isSnapshot: false,
        title: response.title,
      }
      setSavedComparison(nextComparison)
      setCanEdit(true)
      setProjection(response.projection)
      setSavedInputsJson(JSON.stringify(normalizedInputs))
      setStatus(savedComparison && canEdit ? 'Updated.' : 'Saved.')
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  async function copyShareUrl(): Promise<void> {
    setWorkflowBusy(true)
    try {
      const snapshot = await shareCareerComparison(normalizedInputs, shareIncludesCurrent)
      await navigator.clipboard.writeText(snapshot.shareUrl)
      setStatus('Share snapshot copied.')
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setWorkflowBusy(false)
    }
  }

  async function loadWorkflow(id: string): Promise<void> {
    if (!id) {
      return
    }

    setWorkflowBusy(true)
    try {
      const workflow = await getCareerCompWorkflow(Number(id))
      await activateCareerCompWorkflow(workflow.id)
      setInputs(workflow.inputs)
      setProjection(workflow.projection)
      setSavedComparison({
        id: workflow.id,
        shortCode: workflow.shortCode,
        shareUrl: workflow.shareUrl,
        ownerUserId: workflow.ownerUserId,
        shareIncludesCurrent: workflow.shareIncludesCurrent,
        isSnapshot: false,
        title: workflow.title,
      })
      setCanEdit(true)
      setShareIncludesCurrent(workflow.shareIncludesCurrent)
      setSavedInputsJson(JSON.stringify(normalizeCareerCompInputs(workflow.inputs)))
      setStatus('Loaded workflow.')
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setWorkflowBusy(false)
    }
  }

  async function deleteCurrentWorkflow(): Promise<void> {
    if (!savedComparison || !canEdit) {
      return
    }

    setWorkflowBusy(true)
    try {
      await deleteCareerCompWorkflow(savedComparison.id)
      setSavedComparison(null)
      setCanEdit(false)
      setSavedInputsJson(null)
      setWorkflowSummaries((current) => current.filter((workflow) => workflow.id !== savedComparison.id))
      setStatus('Deleted workflow.')
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setWorkflowBusy(false)
    }
  }

  async function importRsu(): Promise<void> {
    if (!initialData.authenticated) {
      setStatus('Log in to import RSU awards.')
      return
    }

    setWorkflowBusy(true)
    try {
      const response = await importRsuIntoCurrentJob(normalizedInputs.currentJob)
      setInputs({ ...normalizedInputs, currentJob: response.currentJob })
      setStatus(response.importedGrants.length > 0 ? `Imported ${response.importedGrants.length} RSU grant${response.importedGrants.length === 1 ? '' : 's'}.` : 'No RSU awards found to import.')
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setWorkflowBusy(false)
    }
  }

  async function handleExportXlsx(): Promise<void> {
    setIsExporting(true)
    try {
      await downloadFinanceExport('/api/financial-planning/career-comparison/export-xlsx', { inputs: normalizedInputs }, 'career-comparison.xlsx')
      setStatus(null)
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setIsExporting(false)
    }
  }

  function openColumn(column: CareerCompColumnState): void {
    setActiveColumn(column)
  }

  function closeColumn(_depth: number): void {
    setActiveColumn(null)
  }

  function toMillerColumn(column: CareerCompColumnState): MillerColumnShellColumn {
    if (column.kind === 'form') {
      const section = findMeta(CAREER_COMP_FORM_SECTIONS, column.id)

      return {
        key: `form:${column.id}`,
        id: column.id,
        label: section.label,
        shortLabel: section.shortLabel,
        children: <CareerCompFormSection section={column.id} inputs={inputs} onChange={setInputs} />,
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
        <h1 className="text-2xl font-semibold text-foreground md:text-3xl">Career Comparison</h1>
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
            <p className="text-sm text-muted-foreground">Save or fork this comparison, copy a single canonical share link, or export to XLSX.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2" data-career-comp-action-bar>
            <Button type="button" onClick={handleSave} disabled={saving} data-career-comp-action-slot="save-fork">
              {savedComparison && !canEdit ? <GitFork className="size-4" /> : <Save className="size-4" />}
              {saving ? 'Saving…' : saveLabel}
            </Button>
            {initialData.authenticated ? (
              <Button type="button" variant="secondary" onClick={importRsu} disabled={workflowBusy} data-career-comp-action-slot="import-rsu">
                <Upload className="size-4" /> Import RSU
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={copyShareUrl} disabled={workflowBusy} data-career-comp-action-slot="copy-link">
              <Copy className="size-4" /> Share
            </Button>
            <Button type="button" variant="secondary" onClick={handleExportXlsx} disabled={isExporting} data-career-comp-action-slot="export">
              <Download className="size-4" /> {isExporting ? 'Exporting…' : 'Export to XLSX'}
            </Button>
            <Select value={shareIncludesCurrent ? 'inclusive' : 'exclusive'} onValueChange={(value) => setShareIncludesCurrent(value === 'inclusive')}>
              <SelectTrigger aria-label="Share mode" data-career-comp-action-slot="share-mode" className="w-[12rem]">
                <span className="truncate">{shareIncludesCurrent ? 'Share: include current' : 'Share: hide current'}</span>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} sideOffset={4}>
                <SelectItem value="inclusive">Include current job</SelectItem>
                <SelectItem value="exclusive">Hide current job (confidential)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {initialData.authenticated ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Badge variant={hasUnsavedChanges ? 'outline' : 'secondary'}>{hasUnsavedChanges ? 'Unsaved changes' : 'Saved'}</Badge>
            <Select value={selectedWorkflowId} onValueChange={(value) => {
              setSelectedWorkflowId(value)
              void loadWorkflow(value)
            }}>
              <SelectTrigger aria-label="Saved workflows" className="w-[16rem]">
                <span className="truncate">{selectedWorkflowId ? workflowSummaries.find((workflow) => String(workflow.id) === selectedWorkflowId)?.title ?? 'Saved workflow' : 'Load workflow'}</span>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} sideOffset={4}>
                {workflowSummaries.map((workflow) => (
                  <SelectItem key={workflow.id} value={String(workflow.id)}>{workflow.title ?? `Workflow ${workflow.id}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="secondary" onClick={() => selectedWorkflowId && void loadWorkflow(selectedWorkflowId)} disabled={!selectedWorkflowId || workflowBusy}>
              <FolderOpen className="size-4" /> Load
            </Button>
            <Button type="button" variant="destructive" onClick={deleteCurrentWorkflow} disabled={!savedComparison || !canEdit || workflowBusy}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </div>
        ) : null}
      </section>

      <SavedJobPicker inputs={inputs} authenticated={initialData.authenticated} onApply={setInputs} />

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Inputs</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CAREER_COMP_FORM_SECTIONS.map((section) => renderColumnLauncher(section, () => openColumn({ kind: 'form', id: section.id })))}
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

export default CareerCompPage
