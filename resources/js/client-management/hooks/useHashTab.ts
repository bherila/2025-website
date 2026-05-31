import { useCallback, useEffect, useState } from 'react'

/**
 * Syncs the active tab with the URL hash so deep links like `#invoices` work
 * and tab changes update the address bar without adding history entries.
 */
export function useHashTab(defaultTab: string): [string, (value: string) => void] {
  const [activeTab, setActiveTab] = useState(() => window.location.hash.replace('#', '') || defaultTab)

  useEffect(() => {
    const onHashChange = () => setActiveTab(window.location.hash.replace('#', '') || defaultTab)
    window.addEventListener('hashchange', onHashChange)

    return () => window.removeEventListener('hashchange', onHashChange)
  }, [defaultTab])

  const changeTab = useCallback((value: string) => {
    setActiveTab(value)
    window.history.replaceState(null, '', `#${value}`)
  }, [])

  return [activeTab, changeTab]
}
