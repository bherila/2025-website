/**
 * Sanitize hrefs to prevent javascript:, data:, vbscript:, file:, or
 * protocol-relative URLs from rendering. Only allows:
 * - Relative paths/fragments/queries (not //)
 * - http(s):, mailto:, tel: absolute URLs
 *
 * Returns '#' for any value that does not match the allowlist.
 */
export function safeHref(href: unknown): string {
  if (typeof href !== 'string') {
    return '#'
  }

  if (/^\s*(?:javascript|data|vbscript|file):/i.test(href)) {
    return '#'
  }

  if (href.startsWith('//')) {
    return '#'
  }

  if (href === '' || href.startsWith('/') || href.startsWith('?') || href.startsWith('#') || href.startsWith('.')) {
    return href
  }

  try {
    const url = new URL(href)
    if (
      url.protocol === 'https:' ||
      url.protocol === 'http:' ||
      url.protocol === 'mailto:' ||
      url.protocol === 'tel:'
    ) {
      return url.href
    }
  } catch {
    // Invalid URL
  }
  return '#'
}
