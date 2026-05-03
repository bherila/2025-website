import { decode, encode } from '@toon-format/toon'

export type ManualTaxInputFormat = 'json' | 'toon'

export interface PromptInfoForManualInput {
  prompt: string
  json_schema: Record<string, unknown>
  form_label: string
}

export function formatManualTaxInput(data: unknown, format: ManualTaxInputFormat): string {
  if (format === 'toon') {
    return encode(data)
  }

  return JSON.stringify(data, null, 2)
}

export function parseManualTaxInput(input: string, format: ManualTaxInputFormat): unknown {
  return format === 'toon' ? decode(input) : JSON.parse(input)
}

export function getFormatLabel(format: ManualTaxInputFormat): string {
  return format === 'toon' ? 'TOON' : 'JSON'
}

export function buildManualInputPrompt(promptInfo: PromptInfoForManualInput, format: ManualTaxInputFormat): string {
  if (format === 'json') {
    return promptInfo.prompt
  }

  const schema = JSON.stringify(promptInfo.json_schema, null, 2)

  return [
    `Analyze the attached tax document for ${promptInfo.form_label}.`,
    'Return ONLY valid TOON. Do not use markdown, code fences, prose, comments, or JSON.',
    'The TOON value must decode to the exact same object or array shape requested by this schema:',
    schema,
    '',
    'Use the extraction instructions below for field names and tax-specific details. If they say to return JSON, keep the same schema but return TOON instead.',
    '',
    promptInfo.prompt,
  ].join('\n')
}

export function extractBrokerEntriesFromManualInput(parsed: unknown): Array<Record<string, unknown>> {
  const entries = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { accounts?: unknown }).accounts)
      ? (parsed as { accounts: unknown[] }).accounts
      : null

  if (!entries || entries.length === 0) {
    throw new Error('Input must be an array of account/form entries, or an object with an accounts array.')
  }

  return entries.filter((entry): entry is Record<string, unknown> =>
    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
  )
}
