import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'

import AddPaymentModal from '../AddPaymentModal'

describe('AddPaymentModal - overpayment warning', () => {
  const existingPayment = {
    client_invoice_payment_id: 10,
    client_invoice_id: 20,
    amount: '100.00',
    payment_date: '2026-01-15',
    payment_method: 'Check',
    notes: null,
    created_at: null,
    updated_at: null,
  }

  it('does not show the warning when the amount equals remaining balance', () => {
    render(
      <AddPaymentModal
        isOpen
        onClose={() => {}}
        payment={null}
        defaultAmount="100.00"
        remainingBalance={100}
        onSave={() => {}}
      />,
    )
    expect(screen.queryByText(/overpayment/i)).not.toBeInTheDocument()
  })

  it('shows the overpayment warning once amount exceeds remaining balance', () => {
    render(
      <AddPaymentModal
        isOpen
        onClose={() => {}}
        payment={null}
        defaultAmount="100.00"
        remainingBalance={100}
        onSave={() => {}}
      />,
    )
    const input = screen.getByLabelText('Amount') as HTMLInputElement
    fireEvent.change(input, { target: { value: '250' } })
    expect(screen.getByText(/This creates an overpayment/i)).toBeInTheDocument()
    expect(screen.getByText(/\$150\.00/)).toBeInTheDocument()
  })

  it('does not block submitting an overpayment', () => {
    const onSave = jest.fn()
    render(
      <AddPaymentModal
        isOpen
        onClose={() => {}}
        payment={null}
        defaultAmount="100.00"
        remainingBalance={100}
        onSave={onSave}
      />,
    )
    const input = screen.getByLabelText('Amount') as HTMLInputElement
    fireEvent.change(input, { target: { value: '250' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Payment/i }))
    expect(onSave).toHaveBeenCalled()
    expect((onSave.mock.calls[0] as any[])[0].amount).toBe('250')
  })

  it('silently hides the warning when remainingBalance is undefined', () => {
    render(
      <AddPaymentModal
        isOpen
        onClose={() => {}}
        payment={null}
        defaultAmount="1000.00"
        onSave={() => {}}
      />,
    )
    expect(screen.queryByText(/overpayment/i)).not.toBeInTheDocument()
  })

  it('does not warn when editing a payment already counted toward the remaining balance', () => {
    render(
      <AddPaymentModal
        isOpen
        onClose={() => {}}
        payment={existingPayment}
        remainingBalance={0}
        onSave={() => {}}
      />,
    )
    expect(screen.queryByText(/overpayment/i)).not.toBeInTheDocument()
  })

  it('warns only on the excess over the editable invoice balance when editing a payment', () => {
    render(
      <AddPaymentModal
        isOpen
        onClose={() => {}}
        payment={{ ...existingPayment, amount: '30.00' }}
        remainingBalance={50}
        onSave={() => {}}
      />,
    )
    const input = screen.getByLabelText('Amount') as HTMLInputElement

    fireEvent.change(input, { target: { value: '80' } })
    expect(screen.queryByText(/overpayment/i)).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: '90' } })
    expect(screen.getByText(/This creates an overpayment/i)).toBeInTheDocument()
    expect(screen.getByText(/\$10\.00/)).toBeInTheDocument()
  })
})
