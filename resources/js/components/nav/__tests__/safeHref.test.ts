import { safeHref } from '../safeHref'

describe('safeHref', () => {
  it('allows relative paths', () => {
    expect(safeHref('/dashboard')).toBe('/dashboard')
    expect(safeHref('/client/portal/acme')).toBe('/client/portal/acme')
  })

  it('allows fragment and query references', () => {
    expect(safeHref('#section')).toBe('#section')
    expect(safeHref('?page=2')).toBe('?page=2')
    expect(safeHref('./relative')).toBe('./relative')
    expect(safeHref('')).toBe('')
  })

  it('allows http and https absolute URLs', () => {
    expect(safeHref('https://example.com/page')).toBe('https://example.com/page')
    expect(safeHref('http://example.com/')).toBe('http://example.com/')
  })

  it('allows mailto and tel URLs', () => {
    expect(safeHref('mailto:test@example.com')).toBe('mailto:test@example.com')
    expect(safeHref('tel:+15551234567')).toBe('tel:+15551234567')
  })

  it('rejects javascript: URLs', () => {
    expect(safeHref('javascript:alert(1)')).toBe('#')
    expect(safeHref('JavaScript:alert(1)')).toBe('#')
    expect(safeHref('  javascript:alert(1)')).toBe('#')
  })

  it('rejects data:, vbscript:, and file: URLs', () => {
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBe('#')
    expect(safeHref('vbscript:msgbox(1)')).toBe('#')
    expect(safeHref('file:///etc/passwd')).toBe('#')
  })

  it('rejects protocol-relative URLs', () => {
    expect(safeHref('//evil.example.com/path')).toBe('#')
  })

  it('rejects non-string inputs', () => {
    expect(safeHref(null)).toBe('#')
    expect(safeHref(undefined)).toBe('#')
    expect(safeHref(42)).toBe('#')
  })

  it('rejects unknown protocols', () => {
    expect(safeHref('ftp://example.com/foo')).toBe('#')
    expect(safeHref('chrome://settings')).toBe('#')
  })

  it('rejects malformed absolute URLs', () => {
    expect(safeHref('http://')).toBe('#')
  })
})
