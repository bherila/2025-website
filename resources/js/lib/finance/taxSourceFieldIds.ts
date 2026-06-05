const SOURCE_FIELD_ATTR = 'data-tax-source-field-id'

function normalizeSegment(value: string | number | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown'
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function k1FieldSourceFieldId(box: string): string {
  return `k1-field-${normalizeSegment(box)}`
}

export function k1CodeSourceFieldId(box: string, code: string): string {
  return `k1-code-${normalizeSegment(box)}-${normalizeSegment(code)}`
}

export function k3Part2SourceFieldId(line: string | number): string {
  return `k3-part2-line-${normalizeSegment(String(line).replace(/^line\s+/i, ''))}`
}

export function k3Part3CountrySourceFieldId(country: string): string {
  return `k3-part3-country-${normalizeSegment(country)}`
}

export function k3ForeignTaxTotalSourceFieldId(): string {
  return 'k3-part3-foreign-tax-total'
}

export function taxSourceFieldDataAttribute(focusFieldId: string): Record<typeof SOURCE_FIELD_ATTR, string> {
  return { [SOURCE_FIELD_ATTR]: focusFieldId }
}

export function taxSourceFieldSelector(focusFieldId: string): string {
  return `[${SOURCE_FIELD_ATTR}="${escapeAttributeValue(focusFieldId)}"]`
}
