import { decode } from '@toon-format/toon'

import { jsonToToon, toonToJson } from '../toonJsonConvert'

// Note: @toon-format/toon is mocked in this test environment.
// The mock decode = JSON.parse and encode = JSON.stringify so test inputs
// must be JSON-parseable strings (as stand-ins for real TOON strings).

describe('toonToJson', () => {
  it('converts valid TOON to JSON output that parses to the expected object', () => {
    // In the test mock, decode = JSON.parse, so valid JSON is a valid "TOON" string
    const result = toonToJson('{"name":"Alice","age":30}')
    expect(result.ok).toBe(true)
    expect(result.output).toBeDefined()
    const parsed = JSON.parse(result.output!)
    expect(parsed).toEqual({ name: 'Alice', age: 30 })
  })

  it('returns ok with empty output for empty input', () => {
    const result = toonToJson('')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('')
  })

  it('returns ok with empty output for whitespace-only input', () => {
    const result = toonToJson('   ')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('')
  })

  it('returns ok:false with a non-empty error for invalid TOON', () => {
    const result = toonToJson('not valid json or toon {{{{')
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe('jsonToToon', () => {
  it('converts valid JSON to TOON output that decodes back to the original object', () => {
    const original = { city: 'Boston', count: 5 }
    const result = jsonToToon(JSON.stringify(original))
    expect(result.ok).toBe(true)
    expect(result.output).toBeDefined()
    const decoded = decode(result.output!)
    expect(decoded).toEqual(original)
  })

  it('returns ok with empty output for empty input', () => {
    const result = jsonToToon('')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('')
  })

  it('returns ok with empty output for whitespace-only input', () => {
    const result = jsonToToon('   ')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('')
  })

  it('returns ok:false with a non-empty error for invalid JSON', () => {
    const result = jsonToToon('{ bad json }')
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe('round-trip', () => {
  it('toonToJson then jsonToToon recovers the object', () => {
    // In the mock, decode = JSON.parse, so valid JSON is the toon input
    const toonText = '{"x":1,"y":"hello"}'
    const toJsonResult = toonToJson(toonText)
    expect(toJsonResult.ok).toBe(true)

    const backResult = jsonToToon(toJsonResult.output!)
    expect(backResult.ok).toBe(true)
    expect(backResult.data).toEqual({ x: 1, y: 'hello' })
  })

  it('jsonToToon then toonToJson recovers the object', () => {
    const jsonText = '{"a":true,"b":99}'
    const toToonResult = jsonToToon(jsonText)
    expect(toToonResult.ok).toBe(true)

    const backResult = toonToJson(toToonResult.output!)
    expect(backResult.ok).toBe(true)
    expect(backResult.data).toEqual({ a: true, b: 99 })
  })
})
