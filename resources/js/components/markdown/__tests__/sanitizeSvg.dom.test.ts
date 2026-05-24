import { sanitizeSvgMarkup } from '../sanitizeSvg'

describe('sanitizeSvgMarkup', () => {
  it('removes <script> children', () => {
    const result = sanitizeSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><g/></svg>')
    expect(result).not.toContain('<script')
    expect(result).toContain('<g')
  })

  it('removes <script> tags written with whitespace before the end-tag close (regex sanitizer bypass)', () => {
    const result = sanitizeSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg"><script >alert(1)</script ></svg>')
    expect(result).not.toContain('alert(1)')
  })

  it('removes <foreignObject> children', () => {
    const result = sanitizeSvgMarkup(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>x</div></foreignObject></svg>',
    )
    expect(result).not.toContain('foreignObject')
    expect(result).not.toContain('<div')
  })

  it('strips event handler attributes (onclick, onmouseover)', () => {
    const result = sanitizeSvgMarkup(
      '<svg xmlns="http://www.w3.org/2000/svg"><g onclick="alert(1)" onmouseover="x()"><rect/></g></svg>',
    )
    expect(result).not.toContain('onclick')
    expect(result).not.toContain('onmouseover')
    expect(result).toContain('<rect')
  })

  it('strips javascript: URLs in href/xlink:href', () => {
    const result = sanitizeSvgMarkup(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
        '<a href="javascript:alert(1)"><text>x</text></a>' +
        '<a xlink:href="JaVaScRiPt:alert(2)"><text>y</text></a>' +
        '</svg>',
    )
    expect(result.toLowerCase()).not.toContain('javascript:')
  })

  it('keeps safe https and fragment hrefs', () => {
    const result = sanitizeSvgMarkup(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
        '<a href="https://example.com"><text>x</text></a>' +
        '<use xlink:href="#sym"/>' +
        '</svg>',
    )
    expect(result).toContain('https://example.com')
    expect(result).toContain('#sym')
  })

  it('returns empty string for malformed input', () => {
    expect(sanitizeSvgMarkup('<not-svg>')).toBe('')
  })

  it('returns empty string when root element is not an svg', () => {
    expect(sanitizeSvgMarkup('<div xmlns="http://www.w3.org/2000/svg"></div>')).toBe('')
  })
})
