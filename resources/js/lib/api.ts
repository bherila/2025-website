import type { fin_payslip } from '@/components/payslip/payslipDbCols'

const csrfToken = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content;

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
  payslipData: fin_payslip,
): Promise<void> {
  const response = await fetch('/api/payslips', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': csrfToken || '',
    },
    body: JSON.stringify(payslipData),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to save payslip')
  }
}

export async function deletePayslip(
  payslip_id: number,
): Promise<void> {
  const response = await fetch(`/api/payslips/${payslip_id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': csrfToken || '',
    },
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to delete payslip')
  }
}

export async function fetchPayslipById(
  payslip_id: number,
): Promise<fin_payslip> {
  const response = await fetch(`/api/payslips/${payslip_id}`)
  if (!response.ok) {
    throw new Error('Failed to fetch payslip by details')
  }
  return response.json()
}

export async function updatePayslipEstimatedStatus(
  payslip_id: number,
  ps_is_estimated: boolean,
): Promise<void> {
  const response = await fetch(`/api/payslips/${payslip_id}/estimated-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': csrfToken || '',
    },
    body: JSON.stringify({ ps_is_estimated }),
  })
  if (!response.ok) {
    const errorText = await response.text();
    try {
        const error = JSON.parse(errorText);
        throw new Error(error.message || 'Failed to update payslip estimated status');
    } catch (e) {
        console.error('Failed to parse error response as JSON:', errorText);
        throw new Error('Failed to update payslip estimated status and received a non-JSON response.');
    }
  }
}

export async function importPayslips(files: File[]): Promise<{ success: boolean; message?: string; error?: string }> {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('files[]', file);
  });

  const response = await fetch('/api/payslips/import', {
    method: 'POST',
    headers: {
      'X-CSRF-TOKEN': csrfToken || '',
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    // Handle specific error codes like 429 for rate limiting
    if (response.status === 429) {
      return { success: false, error: data.error || 'API rate limit exceeded. Please wait and try again.' };
    }
    return { success: false, error: data.message || data.error || 'Failed to import payslips.' };
  }

  return { success: true, message: data.message };
}

