import currency from 'currency.js'
import { useEffect, useState } from 'react'

import { Input } from '@/components/ui/input'

interface CurrencyInputProps {
  id?: string
  value: string | number | null | undefined
  onValueChange: (value: number) => void
  disabled?: boolean
  placeholder?: string
}

function parseCurrencyValue(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0
  }

  return currency(value).value
}

export default function CurrencyInput({
  id,
  value,
  onValueChange,
  disabled,
  placeholder,
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState(value === null || value === undefined || value === ''
    ? ''
    : String(value))

  useEffect(() => {
    setDisplayValue(value === null || value === undefined || value === '' ? '' : String(value))
  }, [value])

  return (
    <Input
      id={id}
      inputMode="decimal"
      value={displayValue}
      disabled={disabled}
      placeholder={placeholder ?? '$0.00'}
      onChange={(event) => {
        setDisplayValue(event.target.value)
        onValueChange(parseCurrencyValue(event.target.value))
      }}
      onBlur={(event) => {
        const parsed = parseCurrencyValue(event.target.value)
        setDisplayValue(currency(parsed).format({ symbol: '' }))
        onValueChange(parsed)
      }}
    />
  )
}
