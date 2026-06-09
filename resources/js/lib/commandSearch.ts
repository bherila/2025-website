export interface CommandSearchIndex {
  exact: Set<string>
  spaced: string
  compact: string
}

export function commandSearchVariants(input: string): string[] {
  const lower = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/&/g, ' and ')

  const spaced = lower
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const compact = spaced.replace(/\s+/g, '')

  return Array.from(new Set([spaced, compact].filter(Boolean)))
}

export function buildCommandSearchIndex(values: string[]): CommandSearchIndex {
  const variants = values.flatMap((value) => commandSearchVariants(value))

  return {
    exact: new Set(variants),
    spaced: variants.join(' '),
    compact: variants.map((variant) => variant.replace(/\s+/g, '')).join(' '),
  }
}

export function commandFilter(value: string, search: string, keywords: string[] = []): number {
  const haystack = buildCommandSearchIndex([value, ...keywords])
  const needles = commandSearchVariants(search)

  if (needles.length === 0) {
    return 1
  }

  for (const needle of needles) {
    if (haystack.exact.has(needle)) {
      return 1
    }
    if (haystack.compact.includes(needle)) {
      return 0.95
    }
    if (haystack.spaced.includes(needle)) {
      return 0.85
    }
  }

  const queryTokens = commandSearchVariants(search)[0]?.split(' ').filter(Boolean) ?? []
  if (
    queryTokens.length > 1 &&
    queryTokens.every((token) => haystack.spaced.includes(token) || haystack.compact.includes(token))
  ) {
    return 0.65
  }

  return 0
}
