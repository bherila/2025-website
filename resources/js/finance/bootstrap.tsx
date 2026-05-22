import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

import AccountNavigation from '@/components/finance/AccountNavigation'
import FinanceNavbar, { type FinanceSection } from '@/components/finance/FinanceNavbar'

export type FinanceAccountId = number | 'all'

export function mountElement<T extends HTMLElement>(
  id: string,
  render: (element: T) => ReactNode,
): void {
  const element = document.getElementById(id) as T | null

  if (!element) {
    return
  }

  createRoot(element).render(render(element))
}

export function readRequiredIntDataset(element: HTMLElement, key: string): number {
  const value = element.dataset[key]

  if (!value) {
    throw new Error(`Missing data-${key} value on #${element.id}`)
  }

  return parseInt(value, 10)
}

export function readAccountIdDataset(element: HTMLElement): FinanceAccountId {
  const value = element.dataset.accountId

  if (value === 'all') {
    return 'all'
  }

  if (!value) {
    throw new Error(`Missing data-account-id value on #${element.id}`)
  }

  return parseInt(value, 10)
}

export function readJsonDataset<T>(element: HTMLElement, key: string, fallback: T): T {
  const value = element.dataset[key]

  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function mountFinanceNavbar(): void {
  mountElement('FinanceNavbar', (element) => {
    const props: {
      accountId?: FinanceAccountId
      activeTab?: string
      activeSection?: FinanceSection
    } = {}

    if (element.dataset.accountId !== undefined) {
      props.accountId = readAccountIdDataset(element)
    }

    if (element.dataset.activeTab !== undefined) {
      props.activeTab = element.dataset.activeTab
    }

    if (element.dataset.activeSection !== undefined) {
      props.activeSection = element.dataset.activeSection as FinanceSection
    }

    return <FinanceNavbar {...props} />
  })
}

export function mountAccountNavigation(): void {
  mountElement('AccountNavigation', (element) => {
    const props: {
      accountId: FinanceAccountId
      activeTab?: string
    } = {
      accountId: readAccountIdDataset(element),
    }

    if (element.dataset.activeTab !== undefined) {
      props.activeTab = element.dataset.activeTab
    }

    return <AccountNavigation {...props} />
  })
}

export function mountAccountChrome(): void {
  mountFinanceNavbar()
  mountAccountNavigation()
}
