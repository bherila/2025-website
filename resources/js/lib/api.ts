import type { fin_payslip } from '@/components/payslip/payslipDbCols'

export async function fetchPayslipYears(): Promise<string[]> {
  const response = await fetch('/api/payslips/years')
  if (!response.ok) {
    throw new Error('Failed to fetch payslip years')
  }
  return response.json()
}

export async function fetchPayslips(year?: string): Promise<fin_payslip[]> {
  const url = year ? `/api/payslips?year=${year}` : '/api/payslips'
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to fetch payslips')
  }
  return response.json()
}

export async function savePayslip(
  payslipData: fin_payslip & {
    originalPeriodStart?: string
    originalPeriodEnd?: string
    originalPayDate?: string
  },
): Promise<void> {
  const response = await fetch('/api/payslips', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': (window as any).CSRF_TOKEN, // Assuming CSRF token is available globally
    },
    body: JSON.stringify(payslipData),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to save payslip')
  }
}

export async function deletePayslip(
  payslipData: Pick<fin_payslip, 'period_start' | 'period_end' | 'pay_date'>,
): Promise<void> {
  const response = await fetch('/api/payslips', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': (window as any).CSRF_TOKEN,
    },
    body: JSON.stringify(payslipData),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to delete payslip')
  }
}

export async function fetchPayslipByDetails(
  payslipDetails: Pick<fin_payslip, 'period_start' | 'period_end' | 'pay_date'>,
): Promise<fin_payslip> {
  const params = new URLSearchParams(payslipDetails).toString()
  const response = await fetch(`/api/payslips/details?${params}`)
  if (!response.ok) {
    throw new Error('Failed to fetch payslip by details')
  }
  return response.json()
}

export async function updatePayslipEstimatedStatus(
  payslipDetails: Pick<fin_payslip, 'period_start' | 'period_end' | 'pay_date' | 'ps_is_estimated'>,
): Promise<void> {
  const response = await fetch('/api/payslips/estimated-status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': (window as any).CSRF_TOKEN,
    },
    body: JSON.stringify(payslipDetails),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to update payslip estimated status')
  }
}
