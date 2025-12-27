import React from 'react'
import ReactDOM from 'react-dom/client'
import ExcessBusinessLossClient from './ExcessBusinessLossClient'
import Container from '@/components/container'

const root = ReactDOM.createRoot(document.getElementById('app') as HTMLElement)

root.render(
  <React.StrictMode>
    <Container>
      <h1 className="text-2xl font-bold mb-4">Excess Business Loss Simulation</h1>
      <ExcessBusinessLossClient />
    </Container>
  </React.StrictMode>,
)
