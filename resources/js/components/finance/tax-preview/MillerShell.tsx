import { ChevronLeft, X } from 'lucide-react'
import { useEffect } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'

import { useTaxPreview } from '../TaxPreviewContext'
import { CommandPalette, useCommandPaletteShortcut } from './CommandPalette'
import { useDockActions } from './DockActions'
import { type FormRegistry, getEntry } from './formRegistry'
import { InstanceTabs } from './InstanceTabs'
import { useTaxPreviewPrefs } from './useTaxPreviewPrefs'
import { useTaxRoute } from './useTaxRoute'

/**
 * Esc truncates the rightmost column (one level back). Skipped when an editable
 * field has focus (textarea, input, contenteditable) so it doesn't fight with
 * field clearing, and when the event was already handled by an open Dialog.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

interface MillerShellProps {
  registry: FormRegistry
  /**
   * Rendered when the route has zero columns (the home/landing state).
   */
  homeView: React.ReactNode
}

/**
 * Renders the current TaxRoute as a horizontal stack of columns.
 * Each column hosts the registry's component for that form id.
 *
 * No spine collapse, no instance tabs, no mobile fallback yet —
 * those land in subsequent commits as forms migrate in.
 */
export function MillerShell({ registry, homeView }: MillerShellProps): React.ReactElement {
  const { route, pushColumn, replaceFrom, truncateTo } = useTaxRoute()
  const state = useTaxPreview()
  const { openWorksheet, paletteOpen, setPaletteOpen } = useDockActions()
  const { addRecent } = useTaxPreviewPrefs(state.year)
  useCommandPaletteShortcut(setPaletteOpen)

  const columnDepth = route.columns.length
  const rightmostForm = columnDepth > 0 ? route.columns[columnDepth - 1]!.form : null
  useEffect(() => {
    if (!rightmostForm) {
      return
    }
    const entry = registry[rightmostForm]
    if (entry?.category === 'Schedule' || entry?.category === 'Form') {
      addRecent(rightmostForm)
    }
  }, [rightmostForm, registry, addRecent])
  useEffect(() => {
    if (typeof window === 'undefined' || columnDepth === 0) {
      return
    }
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) {
        return
      }
      if (isEditableTarget(e.target)) {
        return
      }
      // Don't truncate when an open Dialog (worksheet, K-1 review, etc.) is
      // expected to handle Escape itself. Radix sets [data-state="open"].
      if (document.querySelector('[role="dialog"][data-state="open"]')) {
        return
      }
      truncateTo(columnDepth - 1)
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [columnDepth, truncateTo])

  /**
   * Drill dispatch: column-presentation targets push/replace into the column
   * stack; modal-presentation targets open as a Dialog without affecting the
   * stack (worksheet pattern).
   */
  const dispatchDrill =
    (depth: number) =>
    (target: { form: typeof route.columns[number]['form']; instance?: string }): void => {
      const targetEntry = registry[target.form]
      if (targetEntry?.presentation === 'modal') {
        openWorksheet(target.form)
        return
      }
      if (depth + 1 < route.columns.length) {
        replaceFrom(depth + 1, target)
      } else {
        pushColumn(target)
      }
    }

  const hasFormColumns = route.columns.length > 0

  return (
    // Outer: horizontal ScrollArea. Base UI's Root sets `position: relative`
    // inline, which overrides Tailwind's `.absolute`, so we size with h/w
    // utilities against the (definite-height) parent instead of inset-0.
    <ScrollArea orientation="horizontal" className="h-full w-full">
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} registry={registry} />
      <div className="flex h-full bg-background">
        {/* Home column */}
        <section
          className={`relative flex flex-col bg-card ${
            hasFormColumns
              ? 'hidden w-[960px] shrink-0 border-r border-border md:flex'
              : 'w-full'
          }`}
        >
          <ScrollArea className="h-full w-full">{homeView}</ScrollArea>
        </section>

        {route.columns.map((col, depth) => {
          const entry = getEntry(registry, col.form)
          const Component = entry.component
          const instances = entry.instances ? entry.instances.list(state) : []
          // Auto-select the first tab when no instance is specified in the route.
          const resolvedInstanceKey = col.instance ?? (instances.length > 0 ? instances[0]!.key : undefined)
          const activeInstance = resolvedInstanceKey ? instances.find((i) => i.key === resolvedInstanceKey) : undefined
          const isLast = depth === route.columns.length - 1

          const onDrill = dispatchDrill(depth)

          return (
            <section
              key={`${depth}-${col.form}-${col.instance ?? ''}`}
              className={`relative flex shrink-0 flex-col border-r border-border bg-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-4 motion-safe:duration-200 ${entry.wide ? 'w-full md:w-[960px]' : 'w-full md:w-[480px]'} ${isLast ? '' : 'hidden md:flex'}`}
              data-form-id={col.form}
              data-depth={depth}
              data-last={isLast ? 'true' : 'false'}
            >
              <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
                {depth > 0 && (
                  <button
                    type="button"
                    onClick={() => truncateTo(depth)}
                    className="-ml-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
                    aria-label="Back to previous column"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{entry.shortLabel}</div>
                  <div className="truncate text-xs text-muted-foreground">{entry.label}</div>
                </div>
                <button
                  type="button"
                  onClick={() => truncateTo(depth)}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Close columns after ${entry.shortLabel}`}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </header>
              {entry.instances && (
                <InstanceTabs
                  instances={instances}
                  activeKey={resolvedInstanceKey}
                  onSelect={(key: string) => replaceFrom(depth, { form: col.form, instance: key })}
                  {...(entry.instances.allowCreate
                    ? {
                        onCreate: () => {
                          const created = entry.instances!.create(state)
                          replaceFrom(depth, { form: col.form, instance: created.key })
                        },
                      }
                    : {})}
                />
              )}
              {/* Column content — flex-grown container; ScrollArea sizes to its full height */}
              <div className="min-h-0 flex-1">
                <ScrollArea className="h-full w-full bg-card">
                  <div className="p-4">
                    {entry.instances && !activeInstance ? (
                      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                        <p className="text-sm text-muted-foreground">No {entry.shortLabel} instance selected.</p>
                        {entry.instances.allowCreate && (
                          <button
                            type="button"
                            onClick={() => {
                              const created = entry.instances!.create(state)
                              replaceFrom(depth, { form: col.form, instance: created.key })
                            }}
                            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            Create your first {entry.shortLabel}
                          </button>
                        )}
                      </div>
                    ) : (
                      <Component
                        state={state}
                        {...(activeInstance ? { instance: activeInstance } : {})}
                        onDrill={onDrill}
                      />
                    )}
                  </div>
                </ScrollArea>
              </div>
            </section>
          )
        })}
      </div>
    </ScrollArea>
  )
}
