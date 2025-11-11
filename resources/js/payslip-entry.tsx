import React from 'react'
import { createRoot } from 'react-dom/client'
import PayslipDetailClient from './components/payslip/PayslipDetailClient'
import { fetchPayslipById } from './lib/api'
import type { fin_payslip } from './components/payslip/payslipDbCols'

async function renderPayslipEntryPage() {
  const urlParams = new URLSearchParams(window.location.search)
  const payslip_id = urlParams.get('id')

  let initialPayslip: fin_payslip | undefined = undefined
  if (payslip_id) {
    initialPayslip = await fetchPayslipById(parseInt(payslip_id))
  }

  const container = document.getElementById('payslip-entry-root')
  if (container) {
    const root = createRoot(container)
    root.render(
      <React.StrictMode>
        <PayslipDetailClient initialPayslip={initialPayslip} />
      </React.StrictMode>,
    )
  }
}

renderPayslipEntryPage()
