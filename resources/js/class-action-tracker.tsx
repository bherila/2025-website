import './bootstrap'

import { createRoot } from 'react-dom/client'

import ClassActionTracker from './components/class-action-tracker/ClassActionTracker'

const el = document.getElementById('class-action-tracker')
if (el) {
  createRoot(el).render(<ClassActionTracker />)
}
