import { Input } from '@/components/ui/input'

interface DateInputProps {
  id?: string
  value: string | null | undefined
  onValueChange: (value: string) => void
  disabled?: boolean
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  return value.split(/[ T]/)[0] ?? ''
}

export default function DateInput({ id, value, onValueChange, disabled }: DateInputProps) {
  return (
    <Input
      id={id}
      type="date"
      value={toDateInputValue(value)}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    />
  )
}
