import { decode, encode } from '@toon-format/toon'

export interface ConvertResult {
  ok: boolean
  output?: string
  data?: unknown
  error?: string
  line?: number
  column?: number
}

interface Position {
  line?: number
  column?: number
}

function extractPosition(message: string): Position {
  const lineMatch = /line[:\s]+(\d+)/i.exec(message)
  const colMatch = /col(?:umn)?[:\s]+(\d+)/i.exec(message) ?? /position[:\s]+(\d+)/i.exec(message)
  const pos: Position = {}
  if (lineMatch?.[1] !== undefined) {
    pos.line = parseInt(lineMatch[1], 10)
  }
  if (colMatch?.[1] !== undefined) {
    pos.column = parseInt(colMatch[1], 10)
  }
  return pos
}

export function toonToJson(toonText: string): ConvertResult {
  if (toonText.trim() === '') {
    return { ok: true, output: '' }
  }
  try {
    const data = decode(toonText)
    const output = JSON.stringify(data, null, 2)
    return { ok: true, output, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message, ...extractPosition(message) }
  }
}

export function jsonToToon(jsonText: string): ConvertResult {
  if (jsonText.trim() === '') {
    return { ok: true, output: '' }
  }
  try {
    const data = JSON.parse(jsonText) as unknown
    const output = encode(data)
    return { ok: true, output, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message, ...extractPosition(message) }
  }
}
