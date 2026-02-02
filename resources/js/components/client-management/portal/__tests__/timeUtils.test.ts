import { parseTimeToMinutes, formatMinutesToTime } from '../NewTimeEntryModal'

describe('parseTimeToMinutes', () => {
  test('parses h:mm correctly', () => {
    expect(parseTimeToMinutes('1:30')).toBe(90)
    expect(parseTimeToMinutes(' 1:05 ')).toBe(65)
    expect(parseTimeToMinutes('0:00')).toBe(0)
  })

  test('parses decimal hours correctly', () => {
    expect(parseTimeToMinutes('1.5')).toBe(90)
    expect(parseTimeToMinutes('2')).toBe(120)
    expect(parseTimeToMinutes('1.25h')).toBe(75)
  })

  test('rejects invalid minutes in colon format', () => {
    expect(parseTimeToMinutes('1:60')).toBeNull()
    expect(parseTimeToMinutes('1:99')).toBeNull()
  })

  test('returns null for malformed input', () => {
    expect(parseTimeToMinutes('')).toBeNull()
    expect(parseTimeToMinutes('abc')).toBeNull()
    expect(parseTimeToMinutes('1:')).toBeNull()
  })
})

describe('formatMinutesToTime', () => {
  test('formats minutes to h:mm', () => {
    expect(formatMinutesToTime(90)).toBe('1:30')
    expect(formatMinutesToTime(65)).toBe('1:05')
  })

  test('returns 0:00 for zero or negative', () => {
    expect(formatMinutesToTime(0)).toBe('0:00')
    expect(formatMinutesToTime(-15)).toBe('0:00')
  })
})
