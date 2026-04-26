import { useCallback, useEffect, useState } from 'react'

import {
  type ColumnSpec,
  EMPTY_ROUTE,
  parseHash,
  pushColumn as pushColumnPure,
  replaceFrom as replaceFromPure,
  routesEqual,
  serializeRoute,
  type TaxRoute,
  truncateTo as truncateToPure,
} from './taxRoute'

export interface UseTaxRouteResult {
  route: TaxRoute
  /** Append a column to the rightmost position. */
  pushColumn: (column: ColumnSpec) => void
  /** Replace the column at depth and drop everything to its right. */
  replaceFrom: (depth: number, column: ColumnSpec) => void
  /** Truncate to the first `depth` columns. */
  truncateTo: (depth: number) => void
  /** Replace the entire route. */
  navigate: (route: TaxRoute) => void
}

function readCurrentHash(): string {
  if (typeof window === 'undefined') {
    return ''
  }
  return window.location.hash
}

function writeRoute(route: TaxRoute): void {
  if (typeof window === 'undefined') {
    return
  }
  const next = serializeRoute(route)
  const current = window.location.hash
  if (next === current) {
    return
  }
  if (next === '') {
    history.replaceState(null, '', window.location.pathname + window.location.search)
    // replaceState does not fire hashchange, but all useTaxRoute instances
    // subscribe to it for sync. Dispatch manually so stale instances update.
    window.dispatchEvent(new Event('hashchange'))
  } else {
    window.location.hash = next
  }
}

/**
 * Reactive hash-routing hook for the Tax Preview Miller-columns shell.
 *
 * Reads the current hash on mount, subscribes to `hashchange` so browser
 * back/forward and external hash mutations stay in sync, and exposes
 * push/replace/truncate/navigate actions that write to the hash.
 */
export function useTaxRoute(): UseTaxRouteResult {
  const [route, setRoute] = useState<TaxRoute>(() => parseHash(readCurrentHash()))

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const handler = (): void => {
      const parsed = parseHash(window.location.hash)
      setRoute((prev) => (routesEqual(prev, parsed) ? prev : parsed))
    }
    window.addEventListener('hashchange', handler)
    handler()
    return () => {
      window.removeEventListener('hashchange', handler)
    }
  }, [])

  const pushColumn = useCallback((column: ColumnSpec): void => {
    setRoute((prev) => {
      const next = pushColumnPure(prev, column)
      writeRoute(next)
      return next
    })
  }, [])

  const replaceFrom = useCallback((depth: number, column: ColumnSpec): void => {
    setRoute((prev) => {
      const next = replaceFromPure(prev, depth, column)
      writeRoute(next)
      return next
    })
  }, [])

  const truncateTo = useCallback((depth: number): void => {
    setRoute((prev) => {
      const next = truncateToPure(prev, depth)
      writeRoute(next)
      return next
    })
  }, [])

  const navigate = useCallback((next: TaxRoute): void => {
    setRoute(() => {
      writeRoute(next)
      return next
    })
  }, [])

  return { route, pushColumn, replaceFrom, truncateTo, navigate }
}

export { EMPTY_ROUTE }
