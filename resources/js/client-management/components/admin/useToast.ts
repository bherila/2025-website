import { useCallback, useEffect, useState } from 'react'

export interface ToastState {
  message: string
  variant: 'default' | 'destructive'
}

export function useToast(timeoutMs = 5000) {
  const [toast, setToast] = useState<ToastState | null>(null)

  useEffect(() => {
    if (!toast) {
      return undefined
    }

    const timer = window.setTimeout(() => setToast(null), timeoutMs)

    return () => window.clearTimeout(timer)
  }, [toast, timeoutMs])

  const showToast = useCallback((message: string, variant: ToastState['variant'] = 'default') => {
    setToast({ message, variant })
  }, [])

  return { toast, setToast, showToast }
}
