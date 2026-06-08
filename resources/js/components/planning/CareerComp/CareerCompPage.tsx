import { AlertTriangle, BarChart3, Briefcase, ChevronRight, Download, LineChart, type LucideIcon, ReceiptText, Settings2, Share2, Table2, Trash2, Upload } from 'lucide-react'
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Container from '@/components/container'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MillerColumnShell, type MillerColumnShellColumn, type MillerRegistryEntry } from '@/components/ui/miller'
import { downloadFinanceExport } from '@/lib/finance/downloadFinanceExport'

import {
  computeCareerComp,
  deleteSharedCareerComparison,
  importRsuIntoCurrentJob,
  saveLatestCareerComparison,
  saveSharedCareerComparison,
  shareCareerComparison,
  updateSharedCareerComparisonExpiration,
} from './careerCompApi'
import {
  CAREER_COMP_FORM_SECTIONS,
  CareerCompFormSection,
  type CareerCompFormSectionId,
  GrantEditorColumn,
  type GrantType,
  JobEditorColumn,
  notRenderedViaMillerShell,
  OfferNotesColumn,
  ValuationTimelineColumn,
} from './CareerCompForm'
import { CareerCompLiquidityDetailColumn } from './CareerCompLiquidityDetailColumn'
import { CareerCompLtvDetailColumn, CareerCompLtvDetailYearColumn } from './CareerCompLtvDetailColumn'
import {
  ProjectionAfterTaxFreeCashFlow,
  ProjectionAnnualFreeCashFlow,
  ProjectionLifetimeValue,
  ProjectionLiquidity,
  ProjectionVestingBreakdown,
} from './CareerCompResultViews'
import {
  type CareerCompLiquidityMode,
  type CareerCompLtvBand,
  type CareerCompLtvMetric,
  type CareerCompResultViewId,
  type CareerCompRoute,
  type CareerCompRouteColumn,
  careerCompRoutesEqual,
  grantRouteId,
  grantRouteInstance,
  grantTypeFromRouteId,
  liquidityDetailRouteInstance,
  ltvDetailRouteInstance,
  parseCareerCompHash,
  parseGrantRouteInstance,
  parseLiquidityDetailRouteInstance,
  parseLtvDetailRouteInstance,
  serializeCareerCompRoute,
} from './careerCompRoute'
import { parseCareerCompUrlState, serializeCareerCompUrlState } from './careerCompUrlState'
import type { LiquidityMode } from './charts/LiquidityOverTimeChart'
import { DEFAULT_CAREER_COMP_INPUTS } from './defaults'
import { normalizeCareerCompInputs } from './inputUtils'
import type { CareerCompInitialData, CareerCompInputs, CareerCompProjection } from './types'

interface CareerCompPageProps {
  initialData: CareerCompInitialData
}

type CareerCompColumnId = CareerCompFormSectionId | CareerCompResultViewId

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface CareerCompColumnMeta {
  description: string
  icon: LucideIcon
}

type CareerCompColumnState =
  | { kind: 'form'; id: CareerCompFormSectionId }
  | { kind: 'result'; id: CareerCompResultViewId; initialLiquidityMode?: LiquidityMode | undefined; initialLiquidityBand?: CareerCompLtvBand | undefined }
  | { kind: 'job'; jobId: string }
  | { kind: 'grant'; editorKey: string; jobId: string; grantType: GrantType; grantId?: string | undefined }
  | { kind: 'offerNotes'; jobId: string }
  | { kind: 'valuationTimeline'; jobId: string }
  | { kind: 'liquidityDetail'; jobId: string; year: number; band: CareerCompLtvBand; mode: CareerCompLiquidityMode }
  | { kind: 'ltvDetail'; jobId: string; metric: CareerCompLtvMetric; band: CareerCompLtvBand }
  | { kind: 'ltvDetailYear'; jobId: string; metric: CareerCompLtvMetric; band: CareerCompLtvBand; year: number }

interface ResultViewRegistryEntry extends MillerRegistryEntry<unknown, CareerCompResultViewId, CareerCompColumnMeta> {
  render: (projection: CareerCompProjection, options?: {
    initialLiquidityMode?: LiquidityMode | undefined
    initialLiquidityBand?: CareerCompLtvBand | undefined
    onOpenLiquidityDetail?: (jobId: string, year: number, band: CareerCompLtvBand, mode: CareerCompLiquidityMode) => void
    onOpenLtvDetail?: (jobId: string, metric: CareerCompLtvMetric, band: CareerCompLtvBand) => void
  }) => ReactElement
}

export const RESULT_VIEWS: ResultViewRegistryEntry[] = [
  {
    id: 'liquidity-over-time',
    label: 'Liquidity',
    shortLabel: 'Liquidity',
    presentation: 'column',
    component: notRenderedViaMillerShell,
    meta: { description: 'Compare liquidity by tax mode, job, growth band, and scale.', icon: LineChart },
    size: 'full',
    render: (projection, options) => <ProjectionLiquidity projection={projection} initialMode={options?.initialLiquidityMode} initialBand={options?.initialLiquidityBand} onOpenDetail={options?.onOpenLiquidityDetail} />,
  },
  {
    id: 'annual-fcf',
    label: 'Annual Free Cash Flow',
    shortLabel: 'Annual FCF',
    presentation: 'column',
    component: notRenderedViaMillerShell,
    meta: { description: 'Pre-tax annual cash flow breakdown per job.', icon: BarChart3 },
    size: 'full',
    render: (projection) => <ProjectionAnnualFreeCashFlow projection={projection} />,
  },
  {
    id: 'ltv-table',
    label: 'Lifetime Value Comparison',
    shortLabel: 'LTV Table',
    presentation: 'column',
    component: notRenderedViaMillerShell,
    meta: { description: 'Lifetime totals and server-computed deltas vs. current job.', icon: Table2 },
    size: 'full',
    render: (projection, options) => <ProjectionLifetimeValue projection={projection} onOpenDetail={options?.onOpenLtvDetail} />,
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
    id: 'after-tax-fcf',
    label: 'After-Tax FCF and Lifetime Value',
    shortLabel: 'After-Tax FCF',
    presentation: 'column',
    component: notRenderedViaMillerShell,
    meta: { description: 'After-tax annual FCF, LTV deltas, and ISO/NSO/83(b)/AMT breakdown.', icon: ReceiptText },
    size: 'full',
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

function acceptsUrlState(initialData: CareerCompInitialData): boolean {
  return !initialData.authenticated && (initialData.comparison?.shortCode ?? null) === null
}

function initialInputs(initialData: CareerCompInitialData): CareerCompInputs {
  const base = initialData.inputs ?? DEFAULT_CAREER_COMP_INPUTS
  return acceptsUrlState(initialData) && window.location.search ? parseCareerCompUrlState(window.location.search, base) : normalizeCareerCompInputs(base)
}

function replaceUrlWithInputs(inputs: CareerCompInputs, pathname = window.location.pathname): string {
  const queryString = serializeCareerCompUrlState(inputs)
  const nextUrl = `${pathname}${queryString ? `?${queryString}` : ''}${window.location.hash}`

  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
    window.history.replaceState(null, '', nextUrl)
  }

  return window.location.href
}

function readCurrentHash(): string {
  return typeof window === 'undefined' ? '' : window.location.hash
}

function writeCareerCompRoute(route: CareerCompRoute): void {
  if (typeof window === 'undefined') {
    return
  }

  const nextHash = serializeCareerCompRoute(route)
  if (window.location.hash === nextHash) {
    return
  }

  if (nextHash === '') {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    window.dispatchEvent(new Event('hashchange'))
    return
  }

  window.location.hash = nextHash
}

function routeColumnToState(column: CareerCompRouteColumn): CareerCompColumnState | null {
  if (column.id === 'liquidity-detail') {
    const params = parseLiquidityDetailRouteInstance(column.instance)

    return params ? { kind: 'liquidityDetail', jobId: params.jobId, year: params.year, band: params.band, mode: params.mode } : null
  }

  if (column.id === 'ltv-detail') {
    const params = parseLtvDetailRouteInstance(column.instance)

    return params ? { kind: 'ltvDetail', jobId: params.jobId, metric: params.metric, band: params.band } : null
  }

  if (column.id === 'ltv-detail-year') {
    const params = parseLtvDetailRouteInstance(column.instance, { requireYear: true })

    return params && params.year !== undefined ? { kind: 'ltvDetailYear', jobId: params.jobId, metric: params.metric, band: params.band, year: params.year } : null
  }

  if (column.id === 'job') {
    return column.instance ? { kind: 'job', jobId: column.instance } : null
  }

  if (column.id === 'valuation-timeline') {
    return column.instance ? { kind: 'valuationTimeline', jobId: column.instance } : null
  }

  if (column.id === 'offer-notes') {
    return column.instance ? { kind: 'offerNotes', jobId: column.instance } : null
  }

  const grantType = grantTypeFromRouteId(column.id)
  if (grantType !== null) {
    const parsed = parseGrantRouteInstance(column.instance)
    return parsed
      ? {
          kind: 'grant',
          editorKey: `grant:${parsed.jobId}:${grantType}:${parsed.grantId ?? 'new'}`,
          jobId: parsed.jobId,
          grantType,
          grantId: parsed.grantId,
        }
      : null
  }

  if (CAREER_COMP_FORM_SECTIONS.some((section) => section.id === column.id)) {
    return { kind: 'form', id: column.id as CareerCompFormSectionId }
  }

  if (column.id === 'after-tax-liquidity') {
    return { kind: 'result', id: 'liquidity-over-time', initialLiquidityMode: 'afterTax' }
  }

  if (RESULT_VIEWS.some((view) => view.id === column.id)) {
    return { kind: 'result', id: column.id as CareerCompResultViewId }
  }

  return null
}

function routeToColumnStack(route: CareerCompRoute): CareerCompColumnState[] {
  const stack = route.columns.flatMap((column) => {
    const state = routeColumnToState(column)
    return state ? [state] : []
  })
  const liquidityDetail = stack.find((column): column is Extract<CareerCompColumnState, { kind: 'liquidityDetail' }> => column.kind === 'liquidityDetail')

  if (!liquidityDetail) {
    return stack
  }

  return stack.map((column) => (
    column.kind === 'result' && column.id === 'liquidity-over-time'
      ? { ...column, initialLiquidityMode: liquidityDetail.mode, initialLiquidityBand: liquidityDetail.band }
      : column
  ))
}

function columnStateToRouteColumn(column: CareerCompColumnState): CareerCompRouteColumn {
  if (column.kind === 'form' || column.kind === 'result') {
    return { id: column.id }
  }

  if (column.kind === 'job') {
    return { id: 'job', instance: column.jobId }
  }

  if (column.kind === 'valuationTimeline') {
    return { id: 'valuation-timeline', instance: column.jobId }
  }

  if (column.kind === 'offerNotes') {
    return { id: 'offer-notes', instance: column.jobId }
  }

  if (column.kind === 'liquidityDetail') {
    return {
      id: 'liquidity-detail',
      instance: liquidityDetailRouteInstance({ jobId: column.jobId, year: column.year, band: column.band, mode: column.mode }),
    }
  }

  if (column.kind === 'ltvDetail') {
    return {
      id: 'ltv-detail',
      instance: ltvDetailRouteInstance({ jobId: column.jobId, metric: column.metric, band: column.band }),
    }
  }

  if (column.kind === 'ltvDetailYear') {
    return {
      id: 'ltv-detail-year',
      instance: ltvDetailRouteInstance({ jobId: column.jobId, metric: column.metric, band: column.band, year: column.year }),
    }
  }

  return {
    id: grantRouteId(column.grantType),
    instance: grantRouteInstance(column.jobId, column.grantId),
  }
}

function columnStackToRoute(columns: CareerCompColumnState[]): CareerCompRoute {
  return { columns: columns.map(columnStateToRouteColumn) }
}

function ProjectionEmptyState({ loading }: { loading: boolean }): ReactElement {
  return (
    <div className="rounded-md border border-muted bg-muted/30 p-4 text-sm text-muted-foreground">
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
      className="group flex min-h-16 w-full items-center gap-3 rounded-md border border-muted bg-card px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

function SaveStateBadge({ state, label }: { state: SaveState; label: string }): ReactElement | null {
  if (state === 'saving') {
    return <Badge variant="outline">Saving…</Badge>
  }
  if (state === 'saved') {
    return <Badge variant="secondary">{label}</Badge>
  }
  if (state === 'error') {
    return <Badge variant="destructive">Save failed</Badge>
  }
  return null
}

function isIsoLimitWarning(warning: string | null): boolean {
  return warning?.includes('ISO first-exercisable value exceeds $100k') ?? false
}

function WarningDetailsDialog({ warning, onOpenChange }: { warning: string | null; onOpenChange: (open: boolean) => void }): ReactElement {
  const isIsoLimit = isIsoLimitWarning(warning)

  return (
    <Dialog open={warning !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isIsoLimit ? 'Why ISO/NSO still matters with early exercise' : 'Projection warning'}</DialogTitle>
          <DialogDescription>{warning}</DialogDescription>
        </DialogHeader>
        {isIsoLimit ? (
          <div className="grid gap-3 text-sm leading-relaxed text-foreground">
            <p>
              Early exercise does not remove the ISO $100k limit. The model applies that limit based on the grant-date FMV of shares first exercisable in a calendar year. If early exercise makes the full grant exercisable in the grant year, the amount above $100k is modeled as NSO.
            </p>
            <p>
              If the exercise price equals FMV at grant-date exercise, the immediate ISO AMT preference and NSO ordinary-income spread may both be $0. The ISO/NSO split can still matter later for holding-period treatment, sale reporting, and any future spread assumptions.
            </p>
            <p className="text-muted-foreground">
              This is projection context, not tax advice. Confirm the actual grant terms, 83(b) filing, and reporting with a tax professional.
            </p>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-foreground">
            This warning comes from the projection engine and may affect the comparison results. Review the related inputs before relying on this scenario.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** ISO timestamp → value for a <input type="date"> (YYYY-MM-DD), or '' when absent. */
function toDateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : ''
}

export function CareerCompPage({ initialData }: CareerCompPageProps): ReactElement {
  const shareCode = initialData.comparison?.shortCode ?? null
  const isShareView = shareCode !== null
  const isCreator = initialData.comparison?.isCreator ?? false

  const [inputs, setInputs] = useState<CareerCompInputs>(() => initialInputs(initialData))
  const normalizedInputs = useMemo(() => normalizeCareerCompInputs(inputs), [inputs])
  const normalizedInputsSignature = useMemo(() => JSON.stringify(normalizedInputs), [normalizedInputs])
  const [projection, setProjection] = useState<CareerCompProjection | null>(initialData.projection)
  const [loading, setLoading] = useState(initialData.projection === null)
  const [status, setStatus] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [columnStack, setColumnStack] = useState<CareerCompColumnState[]>(() => routeToColumnStack(parseCareerCompHash(readCurrentHash())))
  const grantEditorSequenceRef = useRef(0)
  const [isExporting, setIsExporting] = useState(false)
  const [shareDeleted, setShareDeleted] = useState(false)
  const [selectedWarning, setSelectedWarning] = useState<string | null>(null)
  const projectionRequestIdRef = useRef(0)
  const lastStartedProjectionSignatureRef = useRef<string | null>(null)

  // Share dialog (private latest only).
  const [shareOpen, setShareOpen] = useState(false)
  const [shareIncludeCurrent, setShareIncludeCurrent] = useState(true)
  const [shareExpiresOn, setShareExpiresOn] = useState('')
  const [creatingShare, setCreatingShare] = useState(false)

  // Manage-share dialog (creator of a shared fork).
  const [manageOpen, setManageOpen] = useState(false)
  const [manageExpiresOn, setManageExpiresOn] = useState(() => toDateInputValue(initialData.comparison?.expiresAt))

  // On a shared fork, edits autosave to that fork (open to anyone). On the private tool, edits
  // autosave to the owner's latest. Anonymous visitors of the public tool only recompute.
  const canAutosave = (isShareView && !shareDeleted) || (!isShareView && initialData.authenticated)
  const saveLabel = isShareView ? 'Saved to link' : 'Saved'

  useEffect(() => {
    const currentRoute = columnStackToRoute(columnStack)
    if (!careerCompRoutesEqual(parseCareerCompHash(readCurrentHash()), currentRoute)) {
      writeCareerCompRoute(currentRoute)
    }
  }, [columnStack])

  useEffect(() => {
    const handleHashChange = (): void => {
      const nextRoute = parseCareerCompHash(readCurrentHash())
      setColumnStack((current) => {
        const currentRoute = columnStackToRoute(current)
        return careerCompRoutesEqual(currentRoute, nextRoute) ? current : routeToColumnStack(nextRoute)
      })
    }

    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  useEffect(() => {
    // Anonymous public-calculator users have no server record, so the URL (?cc=) is their only
    // persistence + share path. Logged-in users autosave server-side, so we skip the URL clutter.
    if (!isShareView && !initialData.authenticated) {
      replaceUrlWithInputs(normalizedInputs)
    }
  }, [isShareView, initialData.authenticated, normalizedInputs])

  const runProjection = useCallback((nextInputs: CareerCompInputs, signature: string): void => {
    if (lastStartedProjectionSignatureRef.current === signature) {
      return
    }

    lastStartedProjectionSignatureRef.current = signature
    const requestId = projectionRequestIdRef.current + 1
    projectionRequestIdRef.current = requestId

    if (canAutosave) {
      setLoading(true)
      setSaveState('saving')
      const persist = isShareView && shareCode !== null ? saveSharedCareerComparison(shareCode, nextInputs) : saveLatestCareerComparison(nextInputs)
      persist
        .then((response) => {
          if (projectionRequestIdRef.current === requestId) {
            setProjection(response.projection)
            setSaveState('saved')
            setStatus(null)
          }
        })
        .catch((error: unknown) => {
          if (projectionRequestIdRef.current === requestId) {
            lastStartedProjectionSignatureRef.current = null
            setSaveState('error')
            setStatus(error instanceof Error ? error.message : String(error))
          }
        })
        .finally(() => {
          if (projectionRequestIdRef.current === requestId) {
            setLoading(false)
          }
        })
      return
    }

    setLoading(true)
    computeCareerComp(nextInputs)
      .then((nextProjection) => {
        if (projectionRequestIdRef.current === requestId) {
          setProjection(nextProjection)
          setStatus(null)
        }
      })
      .catch((error: unknown) => {
        if (projectionRequestIdRef.current === requestId) {
          lastStartedProjectionSignatureRef.current = null
          setStatus(error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        if (projectionRequestIdRef.current === requestId) {
          setLoading(false)
        }
      })
  }, [canAutosave, isShareView, shareCode])

  useEffect(() => {
    setLoading(true)
    const timeout = window.setTimeout(() => {
      runProjection(normalizedInputs, normalizedInputsSignature)
    }, 350)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [normalizedInputs, normalizedInputsSignature, runProjection])

  function handleFormBlur(): void {
    if (canAutosave) {
      runProjection(normalizedInputs, normalizedInputsSignature)
    }
  }

  async function handleCreateShare(): Promise<void> {
    setCreatingShare(true)
    setStatus(null)
    try {
      const response = await shareCareerComparison(normalizedInputs, shareIncludeCurrent, shareExpiresOn || null)
      if (response.shareUrl) {
        await navigator.clipboard.writeText(response.shareUrl)
      }
      setShareOpen(false)
      setStatus(response.shareUrl ? `Share link created and copied: ${response.shareUrl}` : 'Share link created.')
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setCreatingShare(false)
    }
  }

  async function handleUpdateExpiration(): Promise<void> {
    if (shareCode === null) {
      return
    }
    try {
      await updateSharedCareerComparisonExpiration(shareCode, manageExpiresOn || null)
      setManageOpen(false)
      setStatus(manageExpiresOn ? `Link expires ${manageExpiresOn}.` : 'Expiration removed.')
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleDeleteShare(): Promise<void> {
    if (shareCode === null) {
      return
    }
    try {
      await deleteSharedCareerComparison(shareCode)
      setShareDeleted(true)
      setManageOpen(false)
      setStatus('Share deleted. This link will no longer work.')
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  }

  async function importRsu(): Promise<void> {
    if (!initialData.authenticated) {
      setStatus('Log in to import RSU awards.')
      return
    }

    try {
      const response = await importRsuIntoCurrentJob(normalizedInputs.currentJobs[0] ?? null)
      const currentJobs = normalizedInputs.currentJobs.length > 0
        ? normalizedInputs.currentJobs.map((job, index) => (index === 0 ? response.currentJob : job))
        : [response.currentJob]
      setInputs({ ...normalizedInputs, currentJobs })
      setStatus(response.importedGrants.length > 0 ? `Imported ${response.importedGrants.length} RSU grant${response.importedGrants.length === 1 ? '' : 's'}.` : 'No RSU awards found to import.')
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : String(error))
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

  function openSection(column: CareerCompColumnState): void {
    setColumnStack([column])
  }

  function openJobEditor(jobId: string): void {
    setColumnStack((stack) => {
      const rootColumn = stack[0]
      const section = rootColumn?.kind === 'form' && (rootColumn.id === 'current-job' || rootColumn.id === 'offers')
        ? rootColumn
        : { kind: 'form' as const, id: 'offers' as const }

      return [section, { kind: 'job', jobId }]
    })
  }

  function detailParentStack(stack: CareerCompColumnState[], jobId: string): CareerCompColumnState[] {
    if (stack[1]?.kind === 'job' && stack[1].jobId === jobId) {
      return stack.slice(0, 2)
    }

    return stack.slice(0, 1)
  }

  function openGrantEditor(jobId: string, grantType: GrantType, grantId?: string): void {
    grantEditorSequenceRef.current += 1
    const editorKey = grantId
      ? `grant:${jobId}:${grantType}:${grantId}`
      : `grant:${jobId}:${grantType}:new:${grantEditorSequenceRef.current}`
    setColumnStack((stack) => [...detailParentStack(stack, jobId), { kind: 'grant', editorKey, jobId, grantType, grantId }])
  }

  function openValuationTimeline(jobId: string): void {
    setColumnStack((stack) => [...detailParentStack(stack, jobId), { kind: 'valuationTimeline', jobId }])
  }

  function openOfferNotes(jobId: string): void {
    setColumnStack((stack) => [...detailParentStack(stack, jobId), { kind: 'offerNotes', jobId }])
  }

  function openLiquidityDetail(jobId: string, year: number, band: CareerCompLtvBand, mode: CareerCompLiquidityMode): void {
    setColumnStack((stack) => {
      const liquidityColumn: CareerCompColumnState = stack[0]?.kind === 'result' && stack[0].id === 'liquidity-over-time'
        ? { ...stack[0], initialLiquidityMode: mode, initialLiquidityBand: band }
        : { kind: 'result', id: 'liquidity-over-time', initialLiquidityMode: mode, initialLiquidityBand: band }

      return [liquidityColumn, { kind: 'liquidityDetail', jobId, year, band, mode }]
    })
  }

  function openLtvDetail(jobId: string, metric: CareerCompLtvMetric, band: CareerCompLtvBand): void {
    setColumnStack((stack) => {
      const ltvColumn: CareerCompColumnState = stack[0]?.kind === 'result' && stack[0].id === 'ltv-table'
        ? stack[0]
        : { kind: 'result', id: 'ltv-table' }

      return [ltvColumn, { kind: 'ltvDetail', jobId, metric, band }]
    })
  }

  function openLtvDetailYear(jobId: string, metric: CareerCompLtvMetric, band: CareerCompLtvBand, year: number): void {
    setColumnStack((stack) => {
      const ltvColumn: CareerCompColumnState = stack[0]?.kind === 'result' && stack[0].id === 'ltv-table'
        ? stack[0]
        : { kind: 'result', id: 'ltv-table' }

      return [ltvColumn, { kind: 'ltvDetail', jobId, metric, band }, { kind: 'ltvDetailYear', jobId, metric, band, year }]
    })
  }

  function updateNewGrantColumn(grantId: string): void {
    setColumnStack((stack) => stack.map((column) => (column.kind === 'grant' && column.grantId === undefined ? { ...column, grantId } : column)))
  }

  const activeGrant = [...columnStack].reverse().find((column): column is Extract<CareerCompColumnState, { kind: 'grant' }> => column.kind === 'grant') ?? null

  function closeColumn(depth: number): void {
    setColumnStack((stack) => stack.slice(0, depth))
  }

  function toMillerColumn(column: CareerCompColumnState): MillerColumnShellColumn {
    if (column.kind === 'job') {
      const job = [...inputs.currentJobs, ...inputs.hypotheticalJobs].find((entry) => entry.id === column.jobId)
      const isCurrentJob = inputs.currentJobs.some((entry) => entry.id === column.jobId)

      return {
        key: `job:${column.jobId}`,
        id: 'job',
        label: isCurrentJob ? 'Current job details' : 'Offer details',
        shortLabel: job?.name ?? 'Job',
        size: 'wide',
        children: (
          <JobEditorColumn
            inputs={inputs}
            jobId={column.jobId}
            onChange={setInputs}
            onOpenGrantEditor={openGrantEditor}
            onOpenValuationTimeline={openValuationTimeline}
            onOpenOfferNotes={openOfferNotes}
            onOpenModelAssumptions={() => openSection({ kind: 'form', id: 'model-assumptions' })}
            activeGrant={activeGrant}
          />
        ),
      }
    }

    if (column.kind === 'grant') {
      return {
        key: column.editorKey,
        id: `grant-${column.grantType}`,
        label: column.grantType === 'rsu' ? 'RSU grant' : 'Option grant',
        shortLabel: column.grantId ? 'Edit grant' : 'Add grant',
        children: (
          <GrantEditorColumn
            inputs={inputs}
            jobId={column.jobId}
            grantType={column.grantType}
            grantId={column.grantId}
            onChange={setInputs}
            onGrantCreated={updateNewGrantColumn}
          />
        ),
      }
    }

    if (column.kind === 'valuationTimeline') {
      return {
        key: `valuation:${column.jobId}`,
        id: 'valuation-timeline',
        label: 'Company valuation timeline',
        shortLabel: 'Valuation',
        size: 'full',
        children: <ValuationTimelineColumn inputs={inputs} jobId={column.jobId} onChange={setInputs} />,
      }
    }

    if (column.kind === 'offerNotes') {
      return {
        key: `offer-notes:${column.jobId}`,
        id: 'offer-notes',
        label: 'Offer notes',
        shortLabel: 'Notes',
        size: 'wide',
        children: <OfferNotesColumn inputs={inputs} jobId={column.jobId} onChange={setInputs} />,
      }
    }

    if (column.kind === 'liquidityDetail') {
      return {
        key: `liquidity-detail:${column.jobId}:${column.year}:${column.band}:${column.mode}`,
        id: 'liquidity-detail',
        label: 'Liquidity breakdown',
        shortLabel: String(column.year),
        size: 'wide',
        children: projection ? (
          <CareerCompLiquidityDetailColumn
            projection={projection}
            instanceKey={liquidityDetailRouteInstance({ jobId: column.jobId, year: column.year, band: column.band, mode: column.mode })}
          />
        ) : <ProjectionEmptyState loading={loading} />,
      }
    }

    if (column.kind === 'ltvDetail') {
      return {
        key: `ltv-detail:${column.jobId}:${column.metric}:${column.band}`,
        id: 'ltv-detail',
        label: 'Lifetime value breakdown',
        shortLabel: 'LTV detail',
        size: 'wide',
        children: projection ? (
          <CareerCompLtvDetailColumn
            projection={projection}
            instanceKey={ltvDetailRouteInstance({ jobId: column.jobId, metric: column.metric, band: column.band })}
            onOpenYear={openLtvDetailYear}
          />
        ) : <ProjectionEmptyState loading={loading} />,
      }
    }

    if (column.kind === 'ltvDetailYear') {
      return {
        key: `ltv-detail-year:${column.jobId}:${column.metric}:${column.band}:${column.year}`,
        id: 'ltv-detail-year',
        label: 'Lifetime value inputs',
        shortLabel: String(column.year),
        size: 'wide',
        children: projection ? (
          <CareerCompLtvDetailYearColumn
            projection={projection}
            inputs={normalizedInputs}
            instanceKey={ltvDetailRouteInstance({ jobId: column.jobId, metric: column.metric, band: column.band, year: column.year })}
          />
        ) : <ProjectionEmptyState loading={loading} />,
      }
    }

    if (column.kind === 'form') {
      const section = findMeta(CAREER_COMP_FORM_SECTIONS, column.id)

      return {
        key: `form:${column.id}`,
        id: column.id,
        label: section.label,
        shortLabel: section.shortLabel,
        children: (
          <div onBlurCapture={handleFormBlur}>
            <CareerCompFormSection section={column.id} inputs={inputs} onChange={setInputs} onOpenGrantEditor={openGrantEditor} onOpenValuationTimeline={openValuationTimeline} onOpenOfferNotes={openOfferNotes} onOpenModelAssumptions={() => openSection({ kind: 'form', id: 'model-assumptions' })} activeGrant={activeGrant} onOpenJobEditor={openJobEditor} />
          </div>
        ),
      }
    }

    const view = findMeta(RESULT_VIEWS, column.id)
    const resultKey = column.id === 'liquidity-over-time'
      ? `result:${column.id}:${column.initialLiquidityMode ?? 'preTax'}:${column.initialLiquidityBand ?? 'medium'}`
      : `result:${column.id}`

    return {
      key: resultKey,
      id: column.id,
      label: view.label,
      shortLabel: view.shortLabel,
      size: view.size,
      children: projection ? view.render(projection, { initialLiquidityMode: column.initialLiquidityMode, initialLiquidityBand: column.initialLiquidityBand, onOpenLiquidityDetail: openLiquidityDetail, onOpenLtvDetail: openLtvDetail }) : <ProjectionEmptyState loading={loading} />,
    }
  }

  const columns: MillerColumnShellColumn[] = columnStack.map((column) => toMillerColumn(column))
  const warnings = projection?.warnings ?? []

  const homeView = (
    <div className="grid gap-6 p-4 md:p-6">
      <header className="grid gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-foreground">Career Comparison</h1>
              {isShareView ? <Badge variant="outline">Shared link{isCreator ? ' · you own this' : ''}</Badge> : null}
              {canAutosave ? <SaveStateBadge state={saveState} label={saveLabel} /> : null}
              {loading ? <Badge variant="outline">Calculating</Badge> : null}
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {isShareView
                ? 'Anyone with this link can edit this scenario; changes save to the link.'
                : 'Compare one or more current jobs against hypothetical offers with cash compensation, equity liquidity, and vesting views.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {initialData.authenticated && !isShareView ? (
              <Dialog open={shareOpen} onOpenChange={setShareOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="secondary">
                    <Share2 className="size-4" /> Share
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create a share link</DialogTitle>
                    <DialogDescription>Forks the current scenario into a separate, editable copy. Anyone with the link can view and edit it.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={shareIncludeCurrent} onCheckedChange={(checked) => setShareIncludeCurrent(checked === true)} />
                      Include my current job (uncheck to keep it confidential)
                    </label>
                    <div className="grid gap-2">
                      <Label htmlFor="share-expires-on">Expiration (optional)</Label>
                      <Input id="share-expires-on" type="date" value={shareExpiresOn} onChange={(event) => setShareExpiresOn(event.target.value)} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" onClick={handleCreateShare} disabled={creatingShare}>
                      {creatingShare ? 'Creating…' : 'Create & copy link'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
            {isShareView && isCreator && !shareDeleted ? (
              <Dialog open={manageOpen} onOpenChange={setManageOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="secondary">
                    <Settings2 className="size-4" /> Manage link
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Manage share link</DialogTitle>
                    <DialogDescription>Set an expiration or delete this link. Deleting is permanent and breaks the link for everyone.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-2 py-2">
                    <Label htmlFor="manage-expires-on">Expiration</Label>
                    <Input id="manage-expires-on" type="date" value={manageExpiresOn} onChange={(event) => setManageExpiresOn(event.target.value)} />
                  </div>
                  <DialogFooter className="sm:justify-between">
                    <Button type="button" variant="destructive" onClick={handleDeleteShare}>
                      <Trash2 className="size-4" /> Delete link
                    </Button>
                    <Button type="button" onClick={handleUpdateExpiration}>Save expiration</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
            {initialData.authenticated && !isShareView ? (
              <Button type="button" variant="secondary" onClick={importRsu}>
                <Upload className="size-4" /> Import RSU
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={handleExportXlsx} disabled={isExporting}>
              <Download className="size-4" /> {isExporting ? 'Exporting…' : 'Export to XLSX'}
            </Button>
          </div>
        </div>
      </header>

      {warnings.length > 0 ? (
        <section className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="grid gap-1">
            {warnings.map((warning) => (
              <button
                key={warning}
                type="button"
                className="rounded-sm text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700/50 dark:focus-visible:ring-amber-200/60"
                onClick={() => setSelectedWarning(warning)}
              >
                {warning}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <WarningDetailsDialog warning={selectedWarning} onOpenChange={(open) => { if (!open) setSelectedWarning(null) }} />

      {status ? (
        <section className="rounded-md border border-muted bg-muted/30 p-3 text-sm text-muted-foreground">{status}</section>
      ) : null}

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Inputs</h2>
        <div className="grid gap-2">
          {CAREER_COMP_FORM_SECTIONS.map((section) => renderColumnLauncher(section, () => openSection({ kind: 'form', id: section.id })))}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Results</h2>
        <div className="grid gap-2">
          {RESULT_VIEWS.map((view) => renderColumnLauncher(view, () => openSection({ kind: 'result', id: view.id })))}
        </div>
      </section>
    </div>
  )

  return (
    <Container fluid className="flex h-[calc(100vh-4rem)] min-h-[680px] flex-col bg-background">
      <div className="relative min-h-0 flex-1">
        <MillerColumnShell homeView={homeView} columns={columns} onTruncate={closeColumn} homeColumnClassName="w-full md:w-[460px] xl:w-[460px]" />
      </div>
    </Container>
  )
}

export default CareerCompPage
