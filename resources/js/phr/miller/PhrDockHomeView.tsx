import { ArrowRight, FileText, Pin } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { KeyAmount, MillerColumnSpec, MillerDrillTarget } from '@/components/ui/miller'

import {
  getPhrModuleMeta,
  PHR_LIST_MODULES,
  type PhrModuleCategory,
  type PhrModuleId,
  phrModuleRegistry,
  type PhrRegistryEntry,
  type PhrShellState,
} from './phrModuleRegistry'
import { usePhrDockPrefs } from './usePhrDockPrefs'

const CATEGORY_ORDER: PhrModuleCategory[] = ['Clinical', 'Documents & Imaging', 'Admin']
const LIST_MODULE_IDS = new Set<PhrModuleId>(PHR_LIST_MODULES.map((module) => module.id))

interface PhrDockHomeViewProps {
  patientId: number | undefined
  replaceFrom: (depth: number, column: MillerColumnSpec<PhrModuleId>) => void
  onDrill?: ((target: MillerDrillTarget<PhrModuleId>) => void) | undefined
}

export function PhrDockHomeView({ patientId, replaceFrom, onDrill }: PhrDockHomeViewProps): ReactElement {
  const state: PhrShellState = { patientId }
  const { recent, pinned, addRecent, togglePin, isPinned, clearRecent } = usePhrDockPrefs(patientId)

  if (patientId === undefined) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="space-y-2">
          <p className="font-medium text-foreground">No patient selected</p>
          <p className="text-sm text-muted-foreground">Choose a patient from the selector above to get started.</p>
        </div>
      </div>
    )
  }

  const openModule = (id: PhrModuleId): void => {
    addRecent(id)
    replaceFrom(0, { id })
    onDrill?.({ id })
  }

  const entries = resolveEntries(PHR_LIST_MODULES.map((module) => module.id))
  const pinnedEntries = resolveEntries(pinned)
  const recentEntries = resolveEntries(recent).filter((entry) => !pinned.includes(entry.id))
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    entries: entries.filter((entry) => getPhrModuleMeta(entry).category === category),
  })).filter((group) => group.entries.length > 0)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header className="space-y-1 border-b border-primary/20 pb-4">
        <h1 className="text-lg font-semibold text-foreground">Patient {patientId}</h1>
        <p className="text-sm text-muted-foreground">Open a PHR module.</p>
      </header>

      {pinnedEntries.length > 0 && (
        <ModuleSection
          title="Pinned"
          entries={pinnedEntries}
          state={state}
          isPinned={isPinned}
          onOpen={openModule}
          onTogglePin={togglePin}
          className="border-primary/25 bg-accent/20"
        />
      )}

      {recentEntries.length > 0 && (
        <ModuleSection
          title="Recent"
          entries={recentEntries}
          state={state}
          isPinned={isPinned}
          onOpen={openModule}
          onTogglePin={togglePin}
          className="border-info/25 bg-info/5"
          titleClassName="text-info"
          action={(
            <button
              type="button"
              onClick={clearRecent}
              className="rounded px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear
            </button>
          )}
        />
      )}

      {groups.map((group) => (
        <ModuleSection
          key={group.category}
          title={group.category}
          entries={group.entries}
          state={state}
          isPinned={isPinned}
          onOpen={openModule}
          onTogglePin={togglePin}
        />
      ))}
    </div>
  )
}

function resolveEntries(ids: PhrModuleId[]): PhrRegistryEntry[] {
  return ids
    .filter((id) => LIST_MODULE_IDS.has(id))
    .map((id) => phrModuleRegistry[id])
    .filter((entry): entry is PhrRegistryEntry => entry !== undefined && entry.presentation === 'column')
}

function moduleHasData(entry: PhrRegistryEntry, state: PhrShellState): boolean {
  const meta = getPhrModuleMeta(entry)

  if (meta.keyAmounts) {
    return meta.keyAmounts(state) !== null
  }

  if (meta.hasData) {
    return meta.hasData(state)
  }

  return true
}

interface ModuleSectionProps {
  title: string
  entries: PhrRegistryEntry[]
  state: PhrShellState
  isPinned: (id: PhrModuleId) => boolean
  onOpen: (id: PhrModuleId) => void
  onTogglePin: (id: PhrModuleId) => void
  action?: ReactNode
  className?: string
  titleClassName?: string
}

function ModuleSection({
  title,
  entries,
  state,
  isPinned,
  onOpen,
  onTogglePin,
  action,
  className,
  titleClassName,
}: ModuleSectionProps): ReactElement {
  const sorted = [...entries].sort((a, b) => {
    const aActive = moduleHasData(a, state)
    const bActive = moduleHasData(b, state)

    if (aActive === bActive) {
      return 0
    }

    return aActive ? -1 : 1
  })

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className={`text-sm font-semibold ${titleClassName ?? ''}`}>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((entry) => (
            <ModuleButton
              key={entry.id}
              entry={entry}
              state={state}
              inactive={!moduleHasData(entry, state)}
              pinned={isPinned(entry.id)}
              onOpen={onOpen}
              onTogglePin={() => onTogglePin(entry.id)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

interface ModuleButtonProps {
  entry: PhrRegistryEntry
  state: PhrShellState
  inactive: boolean
  pinned: boolean
  onOpen: (id: PhrModuleId) => void
  onTogglePin: () => void
}

function ModuleButton({ entry, state, inactive, pinned, onOpen, onTogglePin }: ModuleButtonProps): ReactElement {
  const keyAmounts = getPhrModuleMeta(entry).keyAmounts?.(state) ?? null

  return (
    <div className={`group relative flex min-h-[4.75rem] items-stretch overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-primary/40 hover:bg-accent/30 ${inactive ? 'opacity-50' : ''}`}>
      <button
        type="button"
        onClick={() => onOpen(entry.id)}
        className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <FileText className="h-4 w-4 shrink-0 pt-0.5 text-info" aria-hidden="true" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">{entry.shortLabel}</span>
          <span className="truncate text-xs text-muted-foreground">{entry.label}</span>
          {keyAmounts && keyAmounts.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
              {keyAmounts.map((keyAmount) => (
                <span key={keyAmount.label} className="inline-flex items-baseline gap-1 text-[10px] tabular-nums">
                  <span className="text-muted-foreground">{keyAmount.label}</span>
                  <span className="font-medium text-foreground">{formatKeyAmount(keyAmount)}</span>
                </span>
              ))}
            </span>
          )}
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-2 pr-3">
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={pinned ? `Unpin ${entry.label}` : `Pin ${entry.label}`}
          aria-pressed={pinned}
          className={`rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            pinned ? 'opacity-100 text-foreground' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          }`}
        >
          <Pin className={`h-3.5 w-3.5 ${pinned ? 'fill-current' : ''}`} aria-hidden="true" />
        </button>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 self-start text-muted-foreground" aria-hidden="true" />
      </span>
    </div>
  )
}

function formatKeyAmount(keyAmount: KeyAmount): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: Number.isInteger(keyAmount.value) ? 0 : 1,
  }).format(keyAmount.value)
}
