import { useCallback, useEffect, useState } from 'react'

export type AlertVariant = 'default' | 'destructive'

export interface AlertInfo {
  message: string
  variant: AlertVariant
}

/**
 * Holds a transient alert that auto-dismisses after `timeoutMs`. Presence of
 * `alertInfo` means the alert is visible.
 */
export function useDismissibleAlert(timeoutMs = 5000): {
  alertInfo: AlertInfo | null
  showAlert: (message: string, variant?: AlertVariant) => void
  dismissAlert: () => void
} {
  const [alertInfo, setAlertInfo] = useState<AlertInfo | null>(null)

  useEffect(() => {
    if (!alertInfo) {
      return
    }

    const timer = setTimeout(() => setAlertInfo(null), timeoutMs)

    return () => clearTimeout(timer)
  }, [alertInfo, timeoutMs])

  const showAlert = useCallback((message: string, variant: AlertVariant = 'default') => {
    setAlertInfo({ message, variant })
  }, [])

  const dismissAlert = useCallback(() => setAlertInfo(null), [])

  return { alertInfo, showAlert, dismissAlert }
}
