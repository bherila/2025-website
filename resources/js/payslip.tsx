import React from 'react'
import { createRoot } from 'react-dom/client'
import PayslipClient from '@/components/payslip/PayslipClient'
import { fetchPayslipYears, fetchPayslips } from '@/lib/api'

async function renderPayslipPage() {
  const urlParams = new URLSearchParams(window.location.search)
  const selectedYear = urlParams.get('year') || new Date().getFullYear().toString()

  const initialYears = await fetchPayslipYears()
  const initialData = await fetchPayslips(selectedYear)

  const container = document.getElementById('payslip-root')
  if (container) {
    const root = createRoot(container)
    root.render(
      <React.StrictMode>
        <PayslipClient selectedYear={selectedYear} initialData={initialData} initialYears={initialYears} />
      </React.StrictMode>,
    )
  }
}

renderPayslipPage()
