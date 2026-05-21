import { createContext } from 'react'

import type { PreviewRenderRegistry } from './previewRenderRegistry'

export const PreviewRenderRegistryContext = createContext<PreviewRenderRegistry | null>(null)
