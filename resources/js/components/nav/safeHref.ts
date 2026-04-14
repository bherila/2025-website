/**
 * Sanitize hrefs to prevent javascript:, data:, or protocol-relative URLs from rendering.
 * Only allows relative paths (not //) and https:/http: absolute URLs.
 */
export function safeHref(href: string): string {
  if (href.startsWith('/') && !href.startsWith('//')) {
    return href
  }
  try {
    const url = new URL(href)
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return url.href
    }
  } catch {
    // Invalid URL
  }
  return '#'
}
