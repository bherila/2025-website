import React from 'react'
import { createRoot } from 'react-dom/client'

import { RothConversionPage } from '@/components/planning/RothConversion'
import { DEFAULT_ROTH_CONVERSION_INPUTS } from '@/components/planning/RothConversion/defaults'
import type { RothConversionInitialData } from '@/components/planning/RothConversion/types'

function readInitialData(): RothConversionInitialData {
  const element = document.getElementById('roth-conversion-initial-data')
  if (!element?.textContent) {
    return {
      scenario: null,
      inputs: DEFAULT_ROTH_CONVERSION_INPUTS,
      projection: null,
      canEdit: false,
      authenticated: false,
    }
  }

  return JSON.parse(element.textContent) as RothConversionInitialData
}

const app = document.getElementById('app')

if (app) {
  createRoot(app).render(
    <React.StrictMode>
      <RothConversionPage initialData={readInitialData()} />
    </React.StrictMode>,
  )
}
