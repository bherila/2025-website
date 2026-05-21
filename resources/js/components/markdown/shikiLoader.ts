// Pinned CDN import. Re-verify before upgrades.
const SHIKI_URL = 'https://esm.sh/shiki@4.1.0'

export interface ShikiToken {
  content: string
  color?: string
  fontStyle?: number
  bgColor?: string
}

export interface ShikiTokenLine {
  tokens: ShikiToken[]
}

export interface ShikiModule {
  codeToTokens: (
    code: string,
    options: { lang: string; theme: string },
  ) => Promise<{ tokens: ShikiToken[][] } | { tokens: ShikiTokenLine[] }>
  bundledLanguages: Record<string, unknown>
}

let shikiPromise: Promise<ShikiModule> | null = null

export function loadShiki(): Promise<ShikiModule> {
  if (!shikiPromise) {
    shikiPromise = import(/* @vite-ignore */ SHIKI_URL) as Promise<ShikiModule>
  }
  return shikiPromise
}

export function resetShikiForTests(): void {
  shikiPromise = null
}
