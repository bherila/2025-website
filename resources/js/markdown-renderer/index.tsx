import React from 'react'
import { createRoot } from 'react-dom/client'

import { MarkdownRendererPage } from '@/components/markdown/MarkdownRendererPage'
import type { MarkdownInitialData } from '@/components/markdown/types'

function readInitialData(): MarkdownInitialData {
  const element = document.getElementById('markdown-renderer-initial-data')
  if (!element?.textContent) {
    return {
      document: null,
      markdown: '',
      title: null,
      canEdit: false,
      authenticated: false,
    }
  }

  return JSON.parse(element.textContent) as MarkdownInitialData
}

const app = document.getElementById('app')

if (app) {
  createRoot(app).render(
    <React.StrictMode>
      <MarkdownRendererPage initialData={readInitialData()} />
    </React.StrictMode>,
  )
}
