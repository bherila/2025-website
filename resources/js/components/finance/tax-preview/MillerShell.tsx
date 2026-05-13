import { type ReactElement, type ReactNode, useEffect } from 'react'

import { MillerColumnShell, type MillerColumnShellColumn } from '@/components/ui/miller-column-shell'

import { useTaxPreview } from '../TaxPreviewContext'
import { CommandPalette, useCommandPaletteShortcut } from './CommandPalette'
import { useDockActions } from './DockActions'
import { type FormRegistry, getEntry } from './formRegistry'
import { InstanceTabs } from './InstanceTabs'
import { useTaxPreviewPrefs } from './useTaxPreviewPrefs'
import { useTaxRoute } from './useTaxRoute'

interface MillerShellProps {
  registry: FormRegistry
  homeView: ReactNode
}

export function MillerShell({ registry, homeView }: MillerShellProps): ReactElement {
  const { route, pushColumn, replaceFrom, truncateTo, navigate } = useTaxRoute()
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

  const dispatchDrill =
    (depth: number) =>
    (target: { form: typeof route.columns[number]['form']; instance?: string; placement?: 'right' | 'left-of-current' }): void => {
      const targetEntry = registry[target.form]
      if (targetEntry?.presentation === 'modal') {
        openWorksheet(target.form)
        return
      }
      if (target.placement === 'left-of-current') {
        const targetColumn = target.instance ? { form: target.form, instance: target.instance } : { form: target.form }
        const currentColumn = route.columns[depth]
        const precedingColumns = route.columns
          .slice(0, depth)
          .filter((column) => column.form !== target.form || column.instance !== target.instance)
        navigate({
          columns: [
            ...precedingColumns,
            targetColumn,
            ...(currentColumn ? [currentColumn] : []),
            ...route.columns.slice(depth + 1),
          ],
        })
        return
      }
      if (depth + 1 < route.columns.length) {
        replaceFrom(depth + 1, target)
      } else {
        pushColumn(target)
      }
    }

  const columns: MillerColumnShellColumn[] = route.columns.map((col, depth) => {
    const entry = getEntry(registry, col.form)
    const Component = entry.component
    const instances = entry.instances ? entry.instances.list(state) : []
    const resolvedInstanceKey = col.instance ?? (instances.length > 0 ? instances[0]!.key : undefined)
    const activeInstance = resolvedInstanceKey ? instances.find((instance) => instance.key === resolvedInstanceKey) : undefined

    return {
      key: `${depth}-${col.form}-${col.instance ?? ''}`,
      id: col.form,
      label: entry.label,
      shortLabel: entry.shortLabel,
      wide: entry.wide,
      dataAttributes: { 'data-form-id': col.form },
      children: (
        <>
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
              onDrill={dispatchDrill(depth)}
            />
          )}
        </>
      ),
    }
  })

  return (
    <>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} registry={registry} />
      <MillerColumnShell homeView={homeView} columns={columns} onTruncate={truncateTo} />
    </>
  )
}
