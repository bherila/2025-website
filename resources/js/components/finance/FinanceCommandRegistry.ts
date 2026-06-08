import { useEffect, useMemo, useSyncExternalStore } from 'react'

export type FinanceCommandCategory =
  | 'Current account'
  | 'Accounts'
  | 'All accounts'
  | 'Finance tools'
  | 'Tax Preview'

export interface FinanceCommandRow {
  id: string
  label: string
  description?: string
  category: FinanceCommandCategory
  keywords: string[]
  priority?: number
  href?: string
  action?: () => void
  disabled?: boolean
  disabledReason?: string
}

export interface FinanceCommandRegistration {
  source: string
  rows: FinanceCommandRow[]
}

const commandRegistrations = new Map<string, FinanceCommandRow[]>()
const commandListeners = new Set<() => void>()
const paletteOpenListeners = new Set<() => void>()
let paletteOpen = false
let commandRowsSnapshot: FinanceCommandRow[] = []

function rebuildCommandRowsSnapshot(): void {
  commandRowsSnapshot = Array.from(commandRegistrations.values()).flat()
}

function emitCommandChange(): void {
  rebuildCommandRowsSnapshot()
  commandListeners.forEach((listener) => listener())
}

function emitPaletteOpenChange(): void {
  paletteOpenListeners.forEach((listener) => listener())
}

export function registerFinanceCommands(source: string, rows: FinanceCommandRow[]): () => void {
  replaceFinanceCommands(source, rows)

  return () => {
    if (commandRegistrations.get(source) === rows) {
      commandRegistrations.delete(source)
      emitCommandChange()
      return
    }

    commandRegistrations.delete(source)
    emitCommandChange()
  }
}

export function replaceFinanceCommands(source: string, rows: FinanceCommandRow[]): void {
  commandRegistrations.set(source, rows)
  emitCommandChange()
}

export function getFinanceCommandRows(): FinanceCommandRow[] {
  return commandRowsSnapshot
}

export function subscribeFinanceCommands(listener: () => void): () => void {
  commandListeners.add(listener)
  return () => commandListeners.delete(listener)
}

export function setFinanceCommandPaletteOpen(open: boolean): void {
  if (paletteOpen === open) {
    return
  }
  paletteOpen = open
  emitPaletteOpenChange()
}

export function toggleFinanceCommandPalette(): void {
  setFinanceCommandPaletteOpen(!paletteOpen)
}

export function subscribeFinanceCommandPaletteOpen(listener: () => void): () => void {
  paletteOpenListeners.add(listener)
  return () => paletteOpenListeners.delete(listener)
}

export function getFinanceCommandPaletteOpen(): boolean {
  return paletteOpen
}

export function useFinanceCommandRows(): FinanceCommandRow[] {
  return useSyncExternalStore(subscribeFinanceCommands, getFinanceCommandRows, getFinanceCommandRows)
}

export function useFinanceCommandPaletteOpen(): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(
    subscribeFinanceCommandPaletteOpen,
    getFinanceCommandPaletteOpen,
    getFinanceCommandPaletteOpen,
  )

  return [open, setFinanceCommandPaletteOpen]
}

export function useRegisterFinanceCommands(source: string, rows: FinanceCommandRow[], enabled: boolean = true): void {
  const memoizedRows = useMemo(() => rows, [rows])

  useEffect(() => {
    if (!enabled) {
      return
    }

    return registerFinanceCommands(source, memoizedRows)
  }, [enabled, source, memoizedRows])
}
