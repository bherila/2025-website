import '@testing-library/jest-dom'

import { fireEvent, render, screen } from '@testing-library/react'

import CurrencyInput from '@/client-management/components/admin/CurrencyInput'
import DateInput from '@/client-management/components/admin/DateInput'

describe('client management shared inputs', () => {
  it('round-trips currency values as numbers', () => {
    const onValueChange = jest.fn()

    render(<CurrencyInput id="amount" value="" onValueChange={onValueChange} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '$1,234.56' } })
    fireEvent.blur(screen.getByRole('textbox'))

    expect(onValueChange).toHaveBeenLastCalledWith(1234.56)
  })

  it('normalizes local serialized dates for date inputs', () => {
    const onValueChange = jest.fn()

    render(<DateInput id="date" value="2026-05-08 00:00:00" onValueChange={onValueChange} />)

    const input = screen.getByDisplayValue('2026-05-08')
    fireEvent.change(input, { target: { value: '2026-05-09' } })

    expect(onValueChange).toHaveBeenCalledWith('2026-05-09')
  })
})
