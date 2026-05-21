// DOMParser-based SVG sanitizer used before injecting Mermaid output via
// dangerouslySetInnerHTML. Removes disallowed elements outright and strips
// dangerous attributes (event handlers, javascript:/data: URLs in href).
// Defense-in-depth on top of Mermaid's `securityLevel: 'strict'`.

const DISALLOWED_TAGS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed'])
const HREF_ATTRS = new Set(['href', 'xlink:href'])
const SAFE_URL_PREFIX = /^(?:https?:|mailto:|tel:|#|\/[^/])/i

function isUnsafeUrl(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '') {
    return false
  }
  if (trimmed.startsWith('#')) {
    return false
  }
  return !SAFE_URL_PREFIX.test(trimmed)
}

function scrub(node: Element): void {
  for (const child of Array.from(node.children)) {
    if (DISALLOWED_TAGS.has(child.tagName.toLowerCase())) {
      child.remove()
      continue
    }
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) {
        child.removeAttribute(attr.name)
        continue
      }
      if (HREF_ATTRS.has(name) && isUnsafeUrl(attr.value)) {
        child.removeAttribute(attr.name)
      }
    }
    scrub(child)
  }
}

export function sanitizeSvgMarkup(svg: string): string {
  if (typeof DOMParser === 'undefined') {
    return ''
  }
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return ''
  }
  const root = doc.documentElement
  if (!root || root.tagName.toLowerCase() !== 'svg') {
    return ''
  }
  scrub(root)
  return new XMLSerializer().serializeToString(root)
}
