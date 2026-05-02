import React from 'react'
import { createRoot } from 'react-dom/client'

import { RentVsBuyPage } from '@/components/planning/RentVsBuy'

const app = document.getElementById('app')

if (app) {
  createRoot(app).render(
    <React.StrictMode>
      <RentVsBuyPage />
    </React.StrictMode>,
  )
}
