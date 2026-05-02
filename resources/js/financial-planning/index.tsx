import React from 'react'
import ReactDOM from 'react-dom/client'

import FinancialPlanningPage from '@/components/planning/FinancialPlanningPage'

const root = ReactDOM.createRoot(document.getElementById('app') as HTMLElement)
root.render(
  <React.StrictMode>
    <FinancialPlanningPage />
  </React.StrictMode>,
)
