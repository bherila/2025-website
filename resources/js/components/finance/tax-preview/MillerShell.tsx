import { X } from 'lucide-react'

import { type FormRegistry, getEntry } from './formRegistry'
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

  if (route.columns.length === 0) {
    return <div className="flex h-full w-full bg-background">{homeView}</div>
  }

  return (
    <div className="flex h-full w-full overflow-x-auto bg-background">
      {route.columns.map((col, depth) => {
        const entry = getEntry(registry, col.form)
        const Component = entry.component
        const instance =
          col.instance && entry.instances
            ? entry.instances.list({} as never).find((i) => i.key === col.instance)
            : undefined

        return (
          <section
            key={`${depth}-${col.form}-${col.instance ?? ''}`}
            className="flex h-full w-[440px] shrink-0 flex-col border-r border-border bg-card"
            data-form-id={col.form}
            data-depth={depth}
          >
            <header className="flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
              <div className="min-w-0">
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
            <div className="flex-1 overflow-y-auto bg-card p-4">
              <Component
                state={{} as never}
                {...(instance ? { instance } : {})}
                onDrill={(target) => {
                  if (depth + 1 < route.columns.length) {
                    replaceFrom(depth + 1, target)
                  } else {
                    pushColumn(target)
                  }
                }}
              />
            </div>
          </section>
        )
      })}
    </div>
  )
}
