import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

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

export function readRequiredDataset(element: HTMLElement, key: string): string {
  const value = element.dataset[key]

  if (!value) {
    throw new Error(`Missing data-${key} value on #${element.id}`)
  }

  return value
}
