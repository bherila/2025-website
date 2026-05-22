import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { MarbleSortGame } from './MarbleSortGame'

const mount = document.getElementById('marble-sort-root')

if (mount) {
  createRoot(mount).render(
    <StrictMode>
      <MarbleSortGame />
    </StrictMode>,
  )
}
