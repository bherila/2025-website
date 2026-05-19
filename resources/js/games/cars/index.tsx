import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { CarsGame } from './CarsGame'

const mount = document.getElementById('cars-game-root')

if (mount) {
  createRoot(mount).render(
    <StrictMode>
      <CarsGame />
    </StrictMode>,
  )
}
