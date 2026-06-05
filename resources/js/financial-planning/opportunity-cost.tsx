import React from 'react'
import { createRoot } from 'react-dom/client'

import { OpportunityCostPage } from '@/components/planning/OpportunityCost'
import { DEFAULT_OPPORTUNITY_COST_INPUTS } from '@/components/planning/OpportunityCost/defaults'
import type { OpportunityCostInitialData } from '@/components/planning/OpportunityCost/types'

function readInitialData(): OpportunityCostInitialData {
  const element = document.getElementById('opportunity-cost-initial-data')
  if (!element?.textContent) {
    return {
      inputs: DEFAULT_OPPORTUNITY_COST_INPUTS,
      projection: null,
      authenticated: false,
    }
  }

  return JSON.parse(element.textContent) as OpportunityCostInitialData
}

const app = document.getElementById('app')

if (app) {
  createRoot(app).render(
    <React.StrictMode>
      <OpportunityCostPage initialData={readInitialData()} />
    </React.StrictMode>,
  )
}
