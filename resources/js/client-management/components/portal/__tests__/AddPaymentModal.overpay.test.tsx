import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'

import AddPaymentModal from '../AddPaymentModal'

describe('AddPaymentModal - overpayment warning', () => {
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
})
