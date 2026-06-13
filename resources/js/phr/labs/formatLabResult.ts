const INFINITY_PLACEHOLDER_THRESHOLD = 99999
const MAX_DECIMAL_PLACES = 2

export function formatLabNumber(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }

  const rawValue = String(value).trim()
  if (rawValue === '') {
    return null
  }

  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed)) {
    return rawValue
  }

  if (Math.abs(parsed) >= INFINITY_PLACEHOLDER_THRESHOLD) {
    return '∞'
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: MAX_DECIMAL_PLACES,
  }).format(parsed)
}

interface LabRangeResult {
  range_min: string | null
  range_max: string | null
  range_unit: string | null
  reference_range_text: string | null
}

export function formatLabReferenceRange(result: LabRangeResult): string | null {
  const min = formatLabNumber(result.range_min)
  const max = formatLabNumber(result.range_max)

  if (min !== null && max !== null) {
    return `${min}–${max}${result.range_unit ? ` ${result.range_unit}` : ''}`
  }

  return result.reference_range_text
}

interface LabValueResult {
  value: string | null
  value_numeric: string | null
}

export function formatLabValue(result: LabValueResult): string | null {
  return result.value ?? formatLabNumber(result.value_numeric)
}
