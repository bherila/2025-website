import { type ReactElement, type ReactNode, useEffect } from 'react'

import { MillerRegistryShell } from '@/components/ui/miller'

import { useTaxPreview } from '../TaxPreviewContext'
import { CommandPalette, useCommandPaletteShortcut } from './CommandPalette'
import { useDockActions } from './DockActions'
import { type FormRegistry, getTaxFormMeta } from './formRegistry'
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

  const rightmostForm = route.columns.length > 0 ? route.columns[route.columns.length - 1]!.form : null

  useEffect(() => {
    if (!rightmostForm) {
      return
    }
    const entry = registry[rightmostForm]
    const category = entry ? getTaxFormMeta(entry).category : null
    if (category === 'Schedule' || category === 'Form') {
      addRecent(rightmostForm)
    }
  }, [rightmostForm, registry, addRecent])

  return (
    <>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} registry={registry} />
      <MillerRegistryShell
        registry={registry}
        state={state}
        homeView={homeView}
        route={{ columns: route.columns.map((column) => ({ id: column.form, ...(column.instance ? { instance: column.instance } : {}) })) }}
        pushColumn={(column) => pushColumn({ form: column.id, ...(column.instance ? { instance: column.instance } : {}) })}
        replaceFrom={(depth, column) => replaceFrom(depth, { form: column.id, ...(column.instance ? { instance: column.instance } : {}) })}
        truncateTo={truncateTo}
        navigate={(nextRoute) => navigate({ columns: nextRoute.columns.map((column) => ({ form: column.id, ...(column.instance ? { instance: column.instance } : {}) })) })}
        onDrillUnhandled={(target, entry) => {
          if (entry?.presentation === 'modal') {
            openWorksheet(target.id)
          }
        }}
      />
    </>
  )
}
