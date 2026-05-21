// Pinned CDN import. Re-verify before upgrades.
const MERMAID_URL = 'https://esm.sh/mermaid@11.15.0'

export interface MermaidApi {
  initialize: (config: { startOnLoad: boolean; securityLevel: string }) => void
  render: (id: string, code: string) => Promise<{ svg: string }>
}

interface MermaidModule {
  default: MermaidApi
}

let mermaidPromise: Promise<MermaidApi> | null = null

export function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = (import(/* @vite-ignore */ MERMAID_URL) as Promise<MermaidModule>).then((mod) => {
      const m = mod.default
      m.initialize({ startOnLoad: false, securityLevel: 'strict' })
      return m
    })
  }
  return mermaidPromise
}

export function resetMermaidForTests(): void {
  mermaidPromise = null
}
