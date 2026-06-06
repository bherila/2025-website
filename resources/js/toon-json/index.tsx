import React from 'react'
import { createRoot } from 'react-dom/client'

import { ToonJsonConverterPage } from '@/components/toon-json/ToonJsonConverterPage'
import type { ToonInitialData } from '@/components/toon-json/types'

function readInitialData(): ToonInitialData {
  const element = document.getElementById('toon-json-initial-data')
  if (!element?.textContent) {
    return {
      document: null,
      toon: '',
      title: null,
      canEdit: false,
      authenticated: false,
    }
  }

  return JSON.parse(element.textContent) as ToonInitialData
}

const app = document.getElementById('app')

if (app) {
  createRoot(app).render(
    <React.StrictMode>
      <ToonJsonConverterPage initialData={readInitialData()} />
    </React.StrictMode>,
  )
}
