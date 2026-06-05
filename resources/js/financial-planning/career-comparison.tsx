import React from 'react'
import { createRoot } from 'react-dom/client'

import { CareerCompPage } from '@/components/planning/CareerComp'
import { DEFAULT_CAREER_COMP_INPUTS } from '@/components/planning/CareerComp/defaults'
import type { CareerCompInitialData } from '@/components/planning/CareerComp/types'

function readInitialData(): CareerCompInitialData {
  const element = document.getElementById('career-comparison-initial-data')
  if (!element?.textContent) {
    return {
      inputs: DEFAULT_CAREER_COMP_INPUTS,
      projection: null,
      authenticated: false,
    }
  }

  return JSON.parse(element.textContent) as CareerCompInitialData
}

const app = document.getElementById('app')

if (app) {
  createRoot(app).render(
    <React.StrictMode>
      <CareerCompPage initialData={readInitialData()} />
    </React.StrictMode>,
  )
}
