import { ChevronLeft, X } from 'lucide-react'

import { useTaxPreview } from '../TaxPreviewContext'
import { useDockActions } from './DockActions'
import { type FormRegistry, getEntry } from './formRegistry'
import { InstanceTabs } from './InstanceTabs'
import { useTaxRoute } from './useTaxRoute'

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
  const { openWorksheet } = useDockActions()

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

  if (route.columns.length === 0) {
    return <div className="flex h-full w-full bg-background">{homeView}</div>
  }

  return (
    <div className="flex h-full w-full overflow-x-auto bg-background">
      {route.columns.map((col, depth) => {
        const entry = getEntry(registry, col.form)
        const Component = entry.component
        const instances = entry.instances ? entry.instances.list(state) : []
        const activeInstance = col.instance ? instances.find((i) => i.key === col.instance) : undefined
        const isLast = depth === route.columns.length - 1
        const isCollapsed = !isLast

        const onDrill = dispatchDrill(depth)

        if (isCollapsed) {
          return (
            <button
              key={`${depth}-${col.form}-${col.instance ?? ''}`}
              type="button"
              onClick={() => truncateTo(depth + 1)}
              className="hidden h-full w-12 shrink-0 flex-col items-center gap-2 border-r border-border bg-card py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex"
              data-form-id={col.form}
              data-depth={depth}
              data-collapsed="true"
              aria-label={`Expand ${entry.shortLabel} column`}
            >
              <span
                className="font-mono text-[10px] uppercase tracking-wider text-primary [writing-mode:vertical-rl] [text-orientation:mixed]"
                style={{ transform: 'rotate(180deg)' }}
              >
                {entry.shortLabel}
              </span>
              {activeInstance && (
                <span
                  className="font-mono text-[10px] text-muted-foreground [writing-mode:vertical-rl] [text-orientation:mixed]"
                  style={{ transform: 'rotate(180deg)' }}
                >
                  {activeInstance.label}
                </span>
              )}
            </button>
          )
        }

        return (
          <section
            key={`${depth}-${col.form}-${col.instance ?? ''}`}
            className="flex h-full w-full flex-1 flex-col border-r border-border bg-card md:min-w-[440px]"
            data-form-id={col.form}
            data-depth={depth}
          >
            <header className="flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
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
                activeKey={col.instance}
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
            <div className="flex-1 overflow-y-auto bg-card p-4">
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
          </section>
        )
      })}
    </div>
  )
}
