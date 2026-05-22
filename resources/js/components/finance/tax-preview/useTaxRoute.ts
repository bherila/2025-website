import { useCallback } from 'react'

import { useMillerRoute } from '@/components/ui/miller'

import type { FormId } from './formRegistry'
import {
  type ColumnSpec,
  EMPTY_ROUTE,
  FORM_IDS,
  type TaxRoute,
} from './taxRoute'

export interface UseTaxRouteResult {
  route: TaxRoute
  pushColumn: (column: ColumnSpec) => void
  replaceFrom: (depth: number, column: ColumnSpec) => void
  truncateTo: (depth: number) => void
  navigate: (route: TaxRoute) => void
}

function toTaxRoute(route: { columns: { id: FormId; instance?: string }[] }): TaxRoute {
  return {
    columns: route.columns.map((column) => (column.instance
      ? { form: column.id, instance: column.instance }
      : { form: column.id })),
  }
}

function toMillerColumn(column: ColumnSpec): { id: FormId; instance?: string } {
  return column.instance ? { id: column.form, instance: column.instance } : { id: column.form }
}

export function useTaxRoute(): UseTaxRouteResult {
  const { route, pushColumn, replaceFrom, truncateTo, navigate } = useMillerRoute<FormId>(FORM_IDS)

  const pushTaxColumn = useCallback((column: ColumnSpec): void => {
    pushColumn(toMillerColumn(column))
  }, [pushColumn])

  const replaceTaxFrom = useCallback((depth: number, column: ColumnSpec): void => {
    replaceFrom(depth, toMillerColumn(column))
  }, [replaceFrom])

  const navigateTax = useCallback((nextRoute: TaxRoute): void => {
    navigate({ columns: nextRoute.columns.map(toMillerColumn) })
  }, [navigate])

  return {
    route: toTaxRoute(route),
    pushColumn: pushTaxColumn,
    replaceFrom: replaceTaxFrom,
    truncateTo,
    navigate: navigateTax,
  }
}

export { EMPTY_ROUTE }
