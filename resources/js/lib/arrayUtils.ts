export function groupBy<T>(
  items: T[],
  getKey: (item: T) => string | number | null | undefined,
): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const key = String(getKey(item) ?? '')
    groups[key] ??= []
    groups[key].push(item)

    return groups
  }, {})
}

export function sortBy<T>(
  items: T[],
  getValue: (item: T) => string | number | null | undefined,
  direction: 'asc' | 'desc' = 'asc',
): T[] {
  const multiplier = direction === 'asc' ? 1 : -1

  return [...items].sort((left, right) => {
    const leftValue = getValue(left) ?? ''
    const rightValue = getValue(right) ?? ''

    if (leftValue < rightValue) return -1 * multiplier
    if (leftValue > rightValue) return 1 * multiplier

    return 0
  })
}

export function minValue(values: Array<string | number | null | undefined>): string | number | undefined {
  const filtered = values.filter((value): value is string | number => value != null)

  if (filtered.length === 0) return undefined

  return filtered.reduce((min, value) => (value < min ? value : min))
}

export function maxValue(values: Array<string | number | null | undefined>): string | number | undefined {
  const filtered = values.filter((value): value is string | number => value != null)

  if (filtered.length === 0) return undefined

  return filtered.reduce((max, value) => (value > max ? value : max))
}
